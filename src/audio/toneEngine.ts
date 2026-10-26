// Tone.js acoustic guitar. No React in here.
//
//   6 strings × 2 alternating voices (Karplus-Strong) → body EQ (wood box, soft presence, rolled-off top)
//     → vibrato → bend (pitch shift, deliberate bends only) → compressor → tone (gesture lowpass)
//     → room reverb → master → limiter → out
//
// Every sound in the app (landing strum, guide chords, pinches) goes through this one guitar.
// Tone is loaded with a dynamic import so it never runs during server prerendering;
// call preloadTone() early so startAudio() can run synchronously inside a user gesture
// (required to unlock audio on iOS/Safari).

import type { SynthParams } from "@/lib/controls";
import type { Preset } from "@/lib/settings";

type ToneNS = typeof import("tone");
type PluckSynth = InstanceType<ToneNS["PluckSynth"]>;

/** One voice per guitar string, so a new strum re-plucks (and cuts) the old chord like a real guitar. */
const STRINGS = 6;
/** Seconds between strings in a strum: long and loose by default. */
export const STRUM_SPACING = 0.045;

interface AcousticVoice {
  /** Wooden-body resonance around 110 Hz, in dB (the "drive" gesture adds a little more warmth). */
  bodyDb: number;
  /** Presence around 2.5 kHz, in dB. */
  presenceDb: number;
  /** String brightness (PluckSynth dampening, Hz) and ring length (resonance). */
  dampening: number;
  resonance: number;
  /** Pick/finger noise at the attack. Low = softer, rounder. */
  attackNoise: number;
  outputDb: number;
}

const VOICES: Record<Preset, AcousticVoice> = {
  acousticSteel: { bodyDb: 5, presenceDb: 1.5, dampening: 4800, resonance: 0.99, attackNoise: 0.7, outputDb: 0 },
  acousticBright: { bodyDb: 3.5, presenceDb: 3.5, dampening: 6000, resonance: 0.991, attackNoise: 0.9, outputDb: -1 },
  nylon: { bodyDb: 6, presenceDb: -1, dampening: 2800, resonance: 0.986, attackNoise: 0.45, outputDb: 1 },
};

/** How long the previous note on a string takes to fade when the string is played again. */
const HANDOFF_FADE = 0.28;
/** Bends below this many semitones are ignored (wrist wobble), and it switches off below half of it. */
const BEND_ON = 0.3;

export class GuitarSynth {
  /**
   * Two voices per string that take turns: a new note starts on one while the
   * previous note fades out on the other, so chord changes overlap smoothly
   * instead of cutting off.
   */
  private readonly banks: PluckSynth[][];
  private readonly nextBank: number[] = new Array(STRINGS).fill(0);
  private readonly body;
  private readonly presence;
  private readonly vibrato;
  private readonly bend;
  private readonly output;
  private readonly tone;
  private readonly reverb;
  private readonly master;
  private readonly clicker;
  private voice: AcousticVoice = VOICES.acousticSteel;
  private preset: Preset = "acousticSteel";
  private bending = false;

  constructor(private readonly Tone: ToneNS) {
    // Schedule "now" as now: the default 100 ms look-ahead is for sequencing, not live playing.
    Tone.getContext().lookAhead = 0;

    const limiter = new Tone.Limiter(-1).toDestination();
    this.master = new Tone.Gain(1).connect(limiter);
    // Metronome: a short dry tick straight to the output (no reverb).
    this.clicker = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -20,
    }).connect(limiter);
    this.reverb = new Tone.Reverb({ decay: 1.9, preDelay: 0.012, wet: 0.22 }).connect(this.master);
    this.tone = new Tone.Filter({ type: "lowpass", frequency: 7000, Q: 0.5 }).connect(this.reverb);
    this.output = new Tone.Gain(1).connect(this.tone);
    const comp = new Tone.Compressor({ threshold: -22, ratio: 2, attack: 0.02, release: 0.35 }).connect(this.output);
    // A larger window = a smoother (less warbly) pitch shift while bending.
    this.bend = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, wet: 0 }).connect(comp);
    this.vibrato = new Tone.Vibrato({ frequency: 5, depth: 0 }).connect(this.bend);

    // Acoustic body: the wooden box's low resonance, a little low-mid scoop so it
    // isn't boxy, gentle presence, and a rolled-off top so it never sounds harsh.
    const top = new Tone.Filter({ type: "lowpass", frequency: 7500, Q: 0.4 }).connect(this.vibrato);
    this.presence = new Tone.Filter({ type: "peaking", frequency: 2400, Q: 0.8, gain: this.voice.presenceDb }).connect(top);
    const scoop = new Tone.Filter({ type: "peaking", frequency: 450, Q: 1, gain: -2 }).connect(this.presence);
    this.body = new Tone.Filter({ type: "peaking", frequency: 110, Q: 1.1, gain: this.voice.bodyDb }).connect(scoop);
    const rumble = new Tone.Filter({ type: "highpass", frequency: 60, Q: 0.7 }).connect(this.body);

    this.banks = [0, 1].map(() =>
      Array.from({ length: STRINGS }, () =>
        new Tone.PluckSynth({
          attackNoise: this.voice.attackNoise,
          dampening: this.voice.dampening,
          resonance: this.voice.resonance,
          release: 3,
        }).connect(rumble),
      ),
    );
  }

  private get allVoices(): PluckSynth[] {
    return this.banks.flat();
  }

  setPreset(name: Preset): void {
    if (name === this.preset) return;
    this.preset = name;
    this.voice = VOICES[name];
    this.presence.gain.rampTo(this.voice.presenceDb, 0.1);
    this.output.gain.rampTo(this.Tone.dbToGain(this.voice.outputDb), 0.1);
    for (const s of this.allVoices) {
      s.dampening = this.voice.dampening;
      s.resonance = this.voice.resonance;
    }
  }

  /** Pluck string `string` (0 = low E … 5 = high E) at `midi`; the string's previous note fades out. */
  playString(midi: number, velocity = 0.8, delay = 0, string = 0): void {
    const { Tone } = this;
    const s = Math.min(STRINGS - 1, Math.max(0, string));
    const v = Math.min(1, Math.max(0.05, velocity));
    const time = Tone.now() + delay;

    const bank = this.nextBank[s];
    this.nextBank[s] = 1 - bank;
    const fresh = this.banks[bank][s];
    const previous = this.banks[1 - bank][s];

    // Let the old note on this string die away instead of cutting it off.
    previous.volume.cancelScheduledValues(time);
    previous.volume.rampTo(-60, HANDOFF_FADE, time);

    fresh.volume.cancelScheduledValues(time);
    fresh.volume.setValueAtTime(Tone.gainToDb(v) - 5, time);
    fresh.attackNoise = this.voice.attackNoise * (0.5 + 0.7 * v); // harder strumming = a bit more pick
    fresh.triggerAttack(Tone.Frequency(midi, "midi").toFrequency(), time);
  }

  /**
   * Strum a chord, notes low → high (a downstroke), `spacing` seconds per
   * string. Chords with fewer than six notes sit on the top strings.
   */
  strum(midis: readonly number[], velocity = 0.8, spacing = STRUM_SPACING, delay = 0): void {
    const firstString = STRINGS - midis.length;
    // Later strings in the stroke land a little softer, with a touch of human timing.
    midis.forEach((m, i) =>
      this.playString(m, velocity * (1 - i * 0.05), delay + i * spacing * (0.85 + Math.random() * 0.3), firstString + i),
    );
  }

  /** A metronome tick; `accent` for the first beat of a bar or chord. */
  click(accent = false): void {
    this.clicker.triggerAttackRelease(accent ? 1760 : 1175, 0.03, this.Tone.now(), accent ? 1 : 0.6);
  }

  /**
   * Stop everything ringing right now (palm-mute every string and cut the reverb
   * tail), then open back up so the next strum sounds normally.
   */
  muteAll(): void {
    const now = this.Tone.now();
    for (const voice of this.allVoices) {
      voice.volume.cancelScheduledValues(now);
      voice.volume.rampTo(-80, 0.04, now);
    }
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.05);
    this.master.gain.setValueAtTime(0, now + 0.3);
    this.master.gain.linearRampToValueAtTime(1, now + 0.35);
  }

  /** Continuous parameters; call every frame with smoothed values. */
  setParams(p: SynthParams): void {
    const t = 0.06;
    this.tone.frequency.rampTo(Math.min(7000, Math.max(900, p.cutoff)), t); // never muffled, never harsh
    this.reverb.wet.rampTo(0.14 + p.reverbWet, t);
    this.vibrato.depth.rampTo(p.vibrato * 0.3, t);
    // Acoustics don't distort: the "drive" gesture adds a little body warmth instead.
    this.body.gain.rampTo(this.voice.bodyDb + 3 * p.distortion, t);
    // Only pitch-shift for a deliberate bend, with hysteresis so small wrist
    // wobbles never switch it on, and a gentle fade in and out.
    const amount = Math.abs(p.bend);
    if (!this.bending && amount > BEND_ON) this.bending = true;
    else if (this.bending && amount < BEND_ON / 2) this.bending = false;
    this.bend.pitch = this.bending ? p.bend : 0;
    this.bend.wet.rampTo(this.bending ? 1 : 0, 0.12);
  }

  /** Audio output latency (buffering + device) in ms. */
  outputLatencyMs(): number {
    const raw = this.Tone.getContext().rawContext as unknown as { baseLatency?: number; outputLatency?: number };
    return ((raw.baseLatency ?? 0) + (raw.outputLatency ?? 0)) * 1000;
  }
}

let tone: ToneNS | null = null;
let loading: Promise<ToneNS> | null = null;
let synth: GuitarSynth | null = null;

/** Start downloading Tone.js. Safe to call repeatedly. */
export function preloadTone(): Promise<ToneNS> {
  loading ??= import("tone").then((t) => (tone = t));
  return loading;
}

/**
 * Unlock audio and return the shared guitar. Call synchronously inside a user
 * gesture. Returns null if Tone hasn't finished loading yet (it will still
 * unlock as soon as it loads).
 */
export function startAudio(): GuitarSynth | null {
  if (!tone) {
    void preloadTone().then((t) => {
      void t.start();
      synth ??= new GuitarSynth(t);
    });
    return null;
  }
  void tone.start();
  synth ??= new GuitarSynth(tone);
  return synth;
}

/** The shared guitar if audio has already been started (e.g. on the landing page). */
export function getSynth(): GuitarSynth | null {
  return synth;
}

export type AudioState = "unloaded" | AudioContextState;

/** Whether the browser is actually letting audio out ("running"), or still suspended. */
export function audioState(): AudioState {
  return tone ? tone.getContext().state : "unloaded";
}

/** Notify on audio state changes (e.g. suspended → running). Returns an unsubscribe. */
export function subscribeAudioState(listener: () => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void preloadTone().then((t) => {
    if (cancelled) return;
    const ctx = t.getContext();
    ctx.on("statechange", listener);
    unsubscribe = () => ctx.off("statechange", listener);
    listener();
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
