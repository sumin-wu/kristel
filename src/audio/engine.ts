// Web Audio engine: one monophonic Karplus-Strong voice per string. No React in here.

import { midiToHz } from "@/lib/pitch";
import { renderPluck, renderSustain } from "./karplus";

const CUT_FADE = 0.008;
const STOP_FADE = 0.015;
/** Fade when a held (pinched) note is let go, like a fretting finger lifting off. */
const LET_GO_FADE = 0.12;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  sustained: boolean;
}

export interface PluckParams {
  velocity?: number;
  /** Loop the note until releaseSustained() instead of letting it decay. */
  sustain?: boolean;
}

export class GuitarEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: (Voice | null)[];

  constructor(private readonly strings = 6) {
    this.voices = new Array(strings).fill(null);
  }

  /** Create/resume the AudioContext. Call synchronously inside a user gesture (iOS). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain();
      master.gain.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;

      // A silent one-sample buffer started inside the gesture fully unlocks iOS.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start();
    }
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  pluck(string: number, midi: number, { velocity = 0.85, sustain = false }: PluckParams = {}): void {
    const { ctx, master } = this;
    if (!ctx || !master || string < 0 || string >= this.strings) return;

    this.release(string, CUT_FADE);

    const hz = midiToHz(midi);
    const source = ctx.createBufferSource();
    if (sustain) {
      const { data, loopStart, loopEnd } = renderSustain(hz, ctx.sampleRate, { velocity });
      source.buffer = this.toBuffer(ctx, data);
      source.loop = true;
      source.loopStart = loopStart / ctx.sampleRate;
      source.loopEnd = loopEnd / ctx.sampleRate;
    } else {
      source.buffer = this.toBuffer(ctx, renderPluck(hz, ctx.sampleRate, { velocity }));
    }

    const gain = ctx.createGain();
    source.connect(gain).connect(master);
    const voice: Voice = { source, gain, sustained: sustain };
    source.onended = () => {
      gain.disconnect();
      if (this.voices[string] === voice) this.voices[string] = null;
    };
    source.start();
    this.voices[string] = voice;
  }

  stop(string: number): void {
    this.release(string, STOP_FADE);
  }

  /** Let go of every held note. Returns the strings that were released. */
  releaseSustained(): number[] {
    const released: number[] = [];
    this.voices.forEach((voice, s) => {
      if (voice?.sustained) {
        this.release(s, LET_GO_FADE);
        released.push(s);
      }
    });
    return released;
  }

  stopAll(): void {
    for (let s = 0; s < this.strings; s++) this.stop(s);
  }

  dispose(): void {
    this.stopAll();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private toBuffer(ctx: AudioContext, data: Float32Array<ArrayBuffer>): AudioBuffer {
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    return buffer;
  }

  private release(string: number, fade: number): void {
    const voice = this.voices[string];
    const ctx = this.ctx;
    if (!voice || !ctx) return;
    this.voices[string] = null;
    const now = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    voice.source.stop(now + fade + 0.002);
  }
}
