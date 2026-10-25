// Pure settings model for the gesture synth: defaults, validation, mapping rules.

import { KEY_E, SCALES, type ScaleName } from "./gesture";

export const PRESETS = {
  teleClean: { label: "Tele Clean" },
  teleTwang: { label: "Tele Twang" },
  teleCrunch: { label: "Tele Crunch" },
} as const;
export type Preset = keyof typeof PRESETS;

export const GESTURES = {
  height: { label: "Right-hand height" },
  roll: { label: "Right-hand roll" },
  handDistance: { label: "Distance between hands" },
  openness: { label: "Left-hand openness" },
} as const;
export type Gesture = keyof typeof GESTURES;

export const TARGETS = {
  filter: { label: "Filter" },
  reverb: { label: "Reverb" },
  distortion: { label: "Distortion" },
  vibrato: { label: "Vibrato" },
  bend: { label: "Pitch bend" },
} as const;
export type Target = keyof typeof TARGETS;

export type Mapping = Record<Gesture, Target>;

export interface PinchThresholds {
  start: number;
  release: number;
}

export interface Settings {
  preset: Preset;
  scale: ScaleName;
  /** Pitch class of the root, 0 = C … 11 = B. */
  key: number;
  /** 0.5 (needs a tight pinch) … 1.5 (triggers easily). */
  pinchSensitivity: number;
  /** Max bend in semitones. */
  bendRange: number;
  /** Slide transition time in ms. */
  glideMs: number;
  mapping: Mapping;
  /** Per-user thresholds from calibration; null until calibrated. */
  calibration: PinchThresholds | null;
  showDebug: boolean;
  /** The first-run guide has been finished or skipped. */
  guideSeen: boolean;
}

export const DEFAULT_THRESHOLDS: PinchThresholds = { start: 0.25, release: 0.35 };

export const LIMITS = {
  pinchSensitivity: { min: 0.5, max: 1.5, step: 0.05 },
  bendRange: { min: 0.5, max: 4, step: 0.5 },
  glideMs: { min: 20, max: 400, step: 10 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  preset: "teleClean",
  scale: "minorPentatonic",
  key: KEY_E,
  pinchSensitivity: 1,
  bendRange: 2,
  glideMs: 90,
  mapping: { height: "filter", roll: "bend", handDistance: "reverb", openness: "distortion" },
  calibration: null,
  showDebug: true,
  guideSeen: false,
};

/**
 * Point `gesture` at `target`. Each target is driven by at most one gesture,
 * so a gesture already on that target swaps to this gesture's old target.
 */
export function assignTarget(mapping: Mapping, gesture: Gesture, target: Target): Mapping {
  const next = { ...mapping };
  const previous = next[gesture];
  for (const g of Object.keys(next) as Gesture[]) {
    if (g !== gesture && next[g] === target) next[g] = previous;
  }
  next[gesture] = target;
  return next;
}

/** Effective pinch thresholds: calibrated (or default) scaled by sensitivity. */
export function pinchThresholds(settings: Settings): PinchThresholds {
  const base = settings.calibration ?? DEFAULT_THRESHOLDS;
  const s = settings.pinchSensitivity;
  return { start: base.start * s, release: base.release * s };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, v));
const oneOf = <T extends string>(v: unknown, options: Record<T, unknown>): v is T =>
  typeof v === "string" && Object.hasOwn(options, v);

/** Merge anything (e.g. parsed localStorage JSON) over the defaults, keeping only valid fields. */
export function parseSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, mapping: { ...DEFAULT_SETTINGS.mapping } };
  if (typeof raw !== "object" || raw === null) return s;
  const r = raw as Record<string, unknown>;

  if (oneOf(r.preset, PRESETS)) s.preset = r.preset;
  if (oneOf(r.scale, SCALES)) s.scale = r.scale;
  if (isNum(r.key) && Number.isInteger(r.key) && r.key >= 0 && r.key < 12) s.key = r.key;
  if (isNum(r.pinchSensitivity)) s.pinchSensitivity = clamp(r.pinchSensitivity, LIMITS.pinchSensitivity);
  if (isNum(r.bendRange)) s.bendRange = clamp(r.bendRange, LIMITS.bendRange);
  if (isNum(r.glideMs)) s.glideMs = clamp(r.glideMs, LIMITS.glideMs);
  if (typeof r.showDebug === "boolean") s.showDebug = r.showDebug;
  if (typeof r.guideSeen === "boolean") s.guideSeen = r.guideSeen;

  if (typeof r.mapping === "object" && r.mapping !== null) {
    const m = r.mapping as Record<string, unknown>;
    for (const g of Object.keys(GESTURES) as Gesture[]) {
      if (oneOf(m[g], TARGETS)) s.mapping = assignTarget(s.mapping, g, m[g]);
    }
  }

  const c = r.calibration as Record<string, unknown> | null | undefined;
  if (c && isNum(c.start) && isNum(c.release) && c.start > 0 && c.release > c.start && c.release < 1.5) {
    s.calibration = { start: c.start, release: c.release };
  }
  return s;
}
