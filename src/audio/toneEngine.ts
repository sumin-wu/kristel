// Tone.js Telecaster-style guitar. No React in here.
//
//   6 string voices (Karplus-Strong) → pickup EQ (bridge single-coil) → vibrato → bend (pitch shift)
//     → amp drive → compressor → tone (gesture lowpass) → spring-ish reverb → master → limiter → out
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

interface AmpVoice {
  /** Drive at rest, and at full gesture. */
  driveMin: number;
  driveMax: number;
  /** Bridge-pickup bite around 3 kHz, in dB. */
  twangDb: number;
  /** Compressor threshold (lower = more squash/sustain). */
  compThreshold: number;
  outputDb: number;
}

const AMPS: Record<Preset, AmpVoice> = {
  teleClean: { driveMin: 0.02, driveMax: 0.3, twangDb: 5, compThreshold: -18, outputDb: 0 },
  teleTwang: { driveMin: 0.08, driveMax: 0.4, twangDb: 8, compThreshold: -26, outputDb: -1 },
  teleCrunch: { driveMin: 0.35, driveMax: 0.85, twangDb: 4, compThreshold: -20, outputDb: -5 },
};

export class GuitarSynth {
  private readonly strings: PluckSynth[];
  private readonly twang;
  private readonly vibrato;
  private readonly bend;
  private readonly amp;
  private readonly output;
  private readonly comp;
  private readonly tone;
  private readonly reverb;
  private readonly master;
  private ampVoice: AmpVoice = AMPS.teleClean;
  private preset: Preset = "teleClean";
  private drive = -1;

  constructor(private readonly Tone: ToneNS) {
    // Schedule "now" as now: the default 100 ms look-ahead is for sequencing, not live playing.
    Tone.getContext().lookAhead = 0;

    const limiter = new Tone.Limiter(-1).toDestination();
    this.master = new Tone.Gain(1).connect(limiter);
    this.reverb = new Tone.Reverb({ decay: 1.8, preDelay: 0.012, wet: 0.2 }).connect(this.master);
    this.tone = new Tone.Filter({ type: "lowpass", frequency: 8000, Q: 0.6 }).connect(this.reverb);
    this.output = new Tone.Gain(1).connect(this.tone);
    this.comp = new Tone.Compressor({ threshold: -18, ratio: 3.5, attack: 0.008, release: 0.25 }).connect(this.output);
    this.amp = new Tone.Distortion({ distortion: 0.02, oversample: "4x" }).connect(this.comp);
    this.bend = new Tone.PitchShift({ pitch: 0, windowSize: 0.05, wet: 0 }).connect(this.amp);
    this.vibrato = new Tone.Vibrato({ frequency: 5.5, depth: 0 }).connect(this.bend);

    // Bridge single-coil: tight low end, a bright bite around 3 kHz, smooth top.
    const top = new Tone.Filter({ type: "lowpass", frequency: 9500, Q: 0.5 }).connect(this.vibrato);
    this.twang = new Tone.Filter({ type: "peaking", frequency: 3100, Q: 1.2, gain: 5 }).connect(top);
    const thin = new Tone.Filter({ type: "lowshelf", frequency: 220, gain: -4 }).connect(this.twang);
    const tight = new Tone.Filter({ type: "highpass", frequency: 85, Q: 0.7 }).connect(thin);

    // Bright, long-ringing steel strings.
    this.strings = Array.from({ length: STRINGS }, () =>
      new Tone.PluckSynth({ attackNoise: 1.4, dampening: 8500, resonance: 0.992, release: 3 }).connect(tight),
    );
  }

  setPreset(name: Preset): void {
    if (name === this.preset) return;
    this.preset = name;
    this.ampVoice = AMPS[name];
    this.twang.gain.rampTo(this.ampVoice.twangDb, 0.1);
    this.comp.threshold.rampTo(this.ampVoice.compThreshold, 0.1);
    this.output.gain.rampTo(this.Tone.dbToGain(this.ampVoice.outputDb), 0.1);
    this.drive = -1;
  }

  /** Pluck string `string` (0 = low E … 5 = high E) at `midi`. */
  playString(midi: number, velocity = 0.8, delay = 0, string = 0): void {
    const { Tone } = this;
    const v = Math.min(1, Math.max(0.05, velocity));
    const voice = this.strings[Math.min(STRINGS - 1, Math.max(0, string))];
    const time = Tone.now() + delay;
    voice.volume.cancelScheduledValues(time);
    voice.volume.setValueAtTime(Tone.gainToDb(v) - 4, time);
    voice.attackNoise = 0.8 + 1.8 * v; // harder picking = more pick click
    voice.triggerAttack(Tone.Frequency(midi, "midi").toFrequency(), time);
  }

  /**
   * Strum a chord, notes low → high (a downstroke), `spacing` seconds per
   * string. Chords with fewer than six notes sit on the top strings.
   */
  strum(midis: readonly number[], velocity = 0.8, spacing = STRUM_SPACING, delay = 0): void {
    const firstString = STRINGS - midis.length;
    // Later strings in the stroke land a little softer, with a touch of human timing.
    midis.forEach((m, i) =>
      this.playString(m, velocity * (1 - i * 0.04), delay + i * spacing * (0.85 + Math.random() * 0.3), firstString + i),
    );
  }

  /**
   * Stop everything ringing right now (palm-mute every string and cut the reverb
   * tail), then open back up so the next strum sounds normally.
   */
  muteAll(): void {
    const now = this.Tone.now();
    for (const voice of this.strings) {
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
    const t = 0.04;
    this.tone.frequency.rampTo(Math.max(700, p.cutoff), t); // never fully muffled
    this.reverb.wet.rampTo(0.1 + p.reverbWet, t);
    this.vibrato.depth.rampTo(p.vibrato * 0.5, t);
    // Pitch-shift only while actually bending, so the straight tone stays untouched.
    this.bend.pitch = p.bend;
    this.bend.wet.rampTo(Math.abs(p.bend) > 0.05 ? 1 : 0, 0.03);
    // WaveShaper curves are rebuilt on change, so only update in coarse steps.
    const { driveMin, driveMax } = this.ampVoice;
    const drive = Math.round((driveMin + (driveMax - driveMin) * p.distortion) * 50) / 50;
    if (drive !== this.drive) {
      this.drive = drive;
      this.amp.distortion = drive;
    }
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
