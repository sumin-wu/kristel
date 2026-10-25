// Web Audio engine: one monophonic Karplus-Strong voice per string. No React in here.

import { midiToHz } from "@/lib/pitch";
import { renderPluck } from "./karplus";

const CUT_FADE = 0.008;
const STOP_FADE = 0.015;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
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

  pluck(string: number, midi: number, velocity = 0.85): void {
    const { ctx, master } = this;
    if (!ctx || !master || string < 0 || string >= this.strings) return;

    this.release(string, CUT_FADE);

    const data = renderPluck(midiToHz(midi), ctx.sampleRate, { velocity });
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain).connect(master);
    const voice: Voice = { source, gain };
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

  stopAll(): void {
    for (let s = 0; s < this.strings; s++) this.stop(s);
  }

  dispose(): void {
    this.stopAll();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
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
