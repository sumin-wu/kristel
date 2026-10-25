// Pure gesture → note logic for the two-hand gesture synth.
// Fingers: 0 = index, 1 = middle, 2 = ring, 3 = pinky.

export const INDEX = 0;
export const MIDDLE = 1;
export const RING = 2;
export const PINKY = 3;

export const SCALES = {
  minorPentatonic: { label: "Pentatonic minor", steps: [0, 3, 5, 7, 10] },
  major: { label: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  blues: { label: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  dorian: { label: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
} as const;

export type ScaleName = keyof typeof SCALES;

/** Pitch class of E. Keys are pitch classes 0 (C) … 11 (B). */
export const KEY_E = 4;

/**
 * The `index`-th note of a scale counted up from the root in octave 0, so
 * index = octave * steps + (degree − 1). Negative indices go below.
 */
export function scaleIndexToMidi(index: number, scale: ScaleName = "minorPentatonic", key = KEY_E): number {
  const steps = SCALES[scale].steps;
  const octave = Math.floor(index / steps.length);
  const step = steps[index - octave * steps.length];
  return 12 * (octave + 1) + key + step;
}

export function degreeIndex(degree: number, octave: number, scale: ScaleName = "minorPentatonic"): number {
  if (degree < 1 || degree > 5) throw new RangeError(`No scale degree ${degree}`);
  return octave * SCALES[scale].steps.length + degree - 1;
}

/** Scale degree 1..5 in the octave starting at the key's root (E3 = 52 by default). */
export function degreeToMidi(degree: number, octave: number, scale: ScaleName = "minorPentatonic", key = KEY_E): number {
  return scaleIndexToMidi(degreeIndex(degree, octave, scale), scale, key);
}

/** Left hand: no pinch = octave 3, index = 4, middle = 5 (middle wins if both). */
export function octaveFor(leftPinched: readonly boolean[] | null): number {
  if (leftPinched?.[MIDDLE]) return 5;
  if (leftPinched?.[INDEX]) return 4;
  return 3;
}

export interface PinchStart {
  finger: number;
  /** 0..1 from how fast the pinch closed. */
  velocity: number;
}

export interface PinchFrame {
  pinched: boolean[];
  started: PinchStart[];
}

export interface HysteresisOptions {
  /** Ratio below which a pinch starts. */
  start?: number;
  /** Ratio above which a pinch releases. */
  release?: number;
  /** How far back (ms) to look when measuring closing speed. */
  speedWindowMs?: number;
}

/** Closing speed (ratio units per second) → velocity 0.2..1. */
export function velocityFromSpeed(speed: number): number {
  const SLOW = 1;
  const FAST = 6;
  const t = (speed - SLOW) / (FAST - SLOW);
  return Math.min(1, Math.max(0.2, 0.2 + 0.8 * t));
}

/**
 * Per-finger pinch state for one hand with hysteresis: a pinch starts below
 * `start` and holds until the ratio rises above `release`. Reports start edges
 * only, each with a velocity from how fast the finger closed.
 */
export class HysteresisPinch {
  private start: number;
  private release: number;
  private readonly windowMs: number;
  private pinched = [false, false, false, false];
  private history: { time: number; ratios: readonly number[] }[] = [];

  constructor({ start = 0.25, release = 0.35, speedWindowMs = 150 }: HysteresisOptions = {}) {
    this.start = start;
    this.release = release;
    this.windowMs = speedWindowMs;
  }

  setThresholds(start: number, release: number): void {
    this.start = start;
    this.release = release;
  }

  /** Feed one frame of thumb-to-finger ratios (null = hand not seen). */
  update(ratios: readonly number[] | null, time: number): PinchFrame {
    if (!ratios) {
      this.pinched = [false, false, false, false];
      this.history = [];
      return { pinched: [...this.pinched], started: [] };
    }

    this.history = this.history.filter((h) => time - h.time <= this.windowMs);
    const started: PinchStart[] = [];
    ratios.forEach((r, f) => {
      if (this.pinched[f]) {
        if (r > this.release) this.pinched[f] = false;
      } else if (r < this.start) {
        this.pinched[f] = true;
        started.push({ finger: f, velocity: this.closingVelocity(f, r, time) });
      }
    });
    this.history.push({ time, ratios });
    return { pinched: [...this.pinched], started };
  }

  private closingVelocity(finger: number, ratio: number, time: number): number {
    let speed = 0;
    for (const h of this.history) {
      const dt = (time - h.time) / 1000;
      if (dt > 0) speed = Math.max(speed, (h.ratios[finger] - ratio) / dt);
    }
    return velocityFromSpeed(speed);
  }
}

export interface NoteTrigger {
  degree: number;
  velocity: number;
  /** Fingertips involved, for flashing. */
  fingers: number[];
}

export interface LeadInput {
  triggers: NoteTrigger[];
  /** Right-hand pinch state this frame. */
  pinched: readonly boolean[];
  /** Smoothed pinch x in the player's view (0 = left, 1 = right); null = hand lost. */
  x: number | null;
  octave: number;
  scale: ScaleName;
  key: number;
}

export type LeadAction =
  | { type: "on"; midi: number; velocity: number }
  | { type: "glide"; midi: number }
  | { type: "off" };

export interface LeadState {
  holding: boolean;
  /** Scale steps slid away from the note that was plucked. */
  steps: number;
  midi: number | null;
}

/**
 * The right hand's sustained lead note: a pinch start plays it, it holds while
 * the pinch stays closed, sliding the pinch sideways glides through the scale
 * (one step per `stepWidth`), and opening the pinch releases it.
 */
export class LeadController {
  private note: { index: number; fingers: number[]; startX: number; steps: number } | null = null;

  constructor(private readonly stepWidth = 0.07) {}

  update(input: LeadInput): { actions: LeadAction[]; state: LeadState } {
    const actions: LeadAction[] = [];
    const { triggers, pinched, x, octave, scale, key } = input;
    const toMidi = (index: number) => scaleIndexToMidi(index, scale, key);

    const trigger = triggers.at(-1);
    if (trigger && x !== null) {
      const index = degreeIndex(trigger.degree, octave, scale);
      this.note = { index, fingers: trigger.fingers, startX: x, steps: 0 };
      actions.push({ type: "on", midi: toMidi(index), velocity: trigger.velocity });
    } else if (this.note) {
      const released = x === null || this.note.fingers.every((f) => !pinched[f]);
      if (released) {
        this.note = null;
        actions.push({ type: "off" });
      } else {
        // Quantize with half a step of hysteresis so jitter at a boundary doesn't flap.
        const raw = (x! - this.note.startX) / this.stepWidth;
        if (Math.abs(raw - this.note.steps) > 0.75) {
          this.note.steps = Math.round(raw);
          actions.push({ type: "glide", midi: toMidi(this.note.index + this.note.steps) });
        }
      }
    }

    const n = this.note;
    return {
      actions,
      state: { holding: n !== null, steps: n?.steps ?? 0, midi: n ? toMidi(n.index + n.steps) : null },
    };
  }
}
