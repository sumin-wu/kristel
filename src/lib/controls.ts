// Pure continuous-gesture → synth-parameter mappings, and smoothing.

import type { Point3 } from "./pinch";
import type { Gesture, Mapping } from "./settings";

export const SMOOTHING = 0.15;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Linear map of `x` from [inLo, inHi] to 0..1, clamped. */
export function normalize(x: number, inLo: number, inHi: number): number {
  return clamp01((x - inLo) / (inHi - inLo));
}

/** A value that eases toward its target by `alpha` each update; null targets hold. */
export class Smoothed {
  constructor(
    public value: number,
    private readonly alpha = SMOOTHING,
  ) {}

  update(target: number | null): number {
    if (target !== null) this.value = lerp(this.value, target, this.alpha);
    return this.value;
  }
}

// ---- Gestures as unit values (0..1; roll is bipolar −1..1) ----

/** Hand height (image y, 0 = top): low hand = 0, high hand = 1. */
export function heightUnit(y: number): number {
  return 1 - normalize(y, 0.15, 0.85);
}

/** Distance between the hands in normalized image units. */
export function distanceUnit(distance: number): number {
  return normalize(distance, 0.15, 0.75);
}

/** Left-hand openness: fist (≈0.9) = 0, flat hand (≈2.0) = 1. */
export function opennessUnit(openness: number): number {
  return normalize(openness, 0.95, 1.9);
}

/** Roll change since the note started → −1..1 (full scale at ±30°). */
export function rollUnit(deltaRadians: number): number {
  return rollToBend(deltaRadians) / 2;
}

// ---- Targets ----

/** 0..1 → lowpass cutoff, 200 Hz–8 kHz on a log scale. */
export function unitToCutoff(u: number, lo = 200, hi = 8000): number {
  return lo * Math.pow(hi / lo, clamp01(u));
}

export const MAX_REVERB_WET = 0.6;

export function heightToCutoff(y: number): number {
  return unitToCutoff(heightUnit(y));
}

/** Distance between the hands (normalized image units) → reverb wet 0–0.6. */
export function handDistanceToWet(distance: number): number {
  return MAX_REVERB_WET * distanceUnit(distance);
}

/** Average fingertip distance from the wrist, divided by hand size (wrist → middle knuckle). */
export function handOpenness(hand: readonly Point3[]): number {
  const d = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const size = d(hand[0], hand[9]) || 1;
  const tips = [8, 12, 16, 20];
  return tips.reduce((sum, t) => sum + d(hand[0], hand[t]), 0) / tips.length / size;
}

/** Openness (fist ≈ 0.9, flat hand ≈ 2.0) → distortion amount 0..1. */
export function opennessToDistortion(openness: number): number {
  return opennessUnit(openness);
}

/**
 * Hand roll as seen by the player (mirrored view): the angle of the knuckle
 * line (index knuckle → pinky knuckle). `aspect` = video width / height, so
 * the angle is measured in real pixels rather than squashed 0..1 units.
 */
export function rollAngle(hand: readonly { x: number; y: number }[], aspect: number): number {
  const a = hand[5];
  const b = hand[17];
  // Negate x for the mirrored view so clockwise-to-the-player is positive.
  return Math.atan2(b.y - a.y, -(b.x - a.x) * aspect);
}

/** Smallest signed difference a − b, wrapped to (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Roll change since the note started → bend in semitones (±2), with a small dead zone. */
export function rollToBend(deltaRadians: number, fullBendRadians = Math.PI / 6, deadZone = 0.05): number {
  const mag = Math.max(0, Math.abs(deltaRadians) - deadZone) / (fullBendRadians - deadZone);
  return Math.sign(deltaRadians) * Math.min(2, 2 * mag);
}

export type GestureValues = Record<Gesture, number>;

export const BIPOLAR_GESTURES: ReadonlySet<Gesture> = new Set(["roll"]);

export interface SynthParams {
  cutoff: number;
  reverbWet: number;
  distortion: number;
  /** Vibrato depth 0..1. */
  vibrato: number;
  /** Semitones. */
  bend: number;
}

/** What a target sits at when no gesture drives it. */
export const PARAM_DEFAULTS: SynthParams = { cutoff: 8000, reverbWet: 0.2, distortion: 0.4, vibrato: 0, bend: 0 };

/** Apply the gesture→target mapping to smoothed gesture values. */
export function resolveParams(values: GestureValues, mapping: Mapping, bendRange: number): SynthParams {
  const p = { ...PARAM_DEFAULTS };
  for (const g of Object.keys(mapping) as Gesture[]) {
    const v = values[g];
    const bipolar = BIPOLAR_GESTURES.has(g);
    const unipolar = bipolar ? Math.abs(v) : v;
    switch (mapping[g]) {
      case "filter":
        p.cutoff = unitToCutoff(unipolar);
        break;
      case "reverb":
        p.reverbWet = MAX_REVERB_WET * unipolar;
        break;
      case "distortion":
        p.distortion = unipolar;
        break;
      case "vibrato":
        p.vibrato = unipolar;
        break;
      case "bend":
        p.bend = bendRange * (bipolar ? v : 2 * v - 1);
        break;
    }
  }
  return p;
}
