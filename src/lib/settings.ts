// Pure settings model for the gesture synth: defaults, validation, mapping rules.

import { isChordName, type ChordName } from "./chords";
import { SLOTS, type SlotId } from "./combos";
import { KEY_E, SCALES, type ScaleName } from "./gesture";

export const PRESETS = {
  acousticSteel: { label: "Acoustic Steel" },
  acousticBright: { label: "Acoustic Bright" },
  nylon: { label: "Nylon" },
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

/** A named set of chords, each on a right-hand finger combo. */
export interface ChordSet {
  id: string;
  name: string;
  chords: Partial<Record<SlotId, ChordName>>;
}

export const BEATS_PER_CHORD_OPTIONS = [1, 2, 4, 8] as const;

export interface ChordPlayerSettings {
  progression: string;
  bpm: number;
  beatsPerChord: (typeof BEATS_PER_CHORD_OPTIONS)[number];
  /** Metronome click on every beat. */
  click: boolean;
}

/** Not a fixed set: chords built from the key and scale (used by the guide). */
export const SCALE_SET = "scale";

export const DEFAULT_CHORD_SETS: readonly ChordSet[] = [
  {
    id: "tele9",
    name: "Main 9",
    chords: { I: "C", M: "Am", R: "A", P: "D", IM: "G", MR: "Em", RP: "F", IMR: "Bm", MRP: "Cmaj7" },
  },
  {
    id: "song",
    name: "Song: G B C Cm",
    chords: { I: "G", M: "B", R: "C", P: "Cm" },
  },
];

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
  /** The two chord sets, with the player's own finger assignments. */
  chordSets: ChordSet[];
  /** Active set id, or SCALE_SET for key/scale chords. */
  activeSet: string;
  /** The chord play-along: a looping progression at a tempo. */
  chordPlayer: ChordPlayerSettings;
  /** The first-run guide has been finished or skipped. */
  guideSeen: boolean;
}

export const DEFAULT_THRESHOLDS: PinchThresholds = { start: 0.25, release: 0.35 };

export const LIMITS = {
  bpm: { min: 40, max: 200, step: 1 },
  pinchSensitivity: { min: 0.5, max: 1.5, step: 0.05 },
  bendRange: { min: 0.5, max: 4, step: 0.5 },
  glideMs: { min: 20, max: 400, step: 10 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  preset: "acousticSteel",
  scale: "minorPentatonic",
  key: KEY_E,
  pinchSensitivity: 1,
  bendRange: 2,
  glideMs: 90,
  mapping: { height: "filter", roll: "bend", handDistance: "reverb", openness: "distortion" },
  calibration: null,
  showDebug: true,
  chordSets: DEFAULT_CHORD_SETS.map((set) => ({ ...set, chords: { ...set.chords } })),
  activeSet: "tele9",
  chordPlayer: { progression: "Cmaj7 Gmaj7 C G D", bpm: 90, beatsPerChord: 4, click: false },
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

/** Put `chord` on `slot` in a set (null clears the slot). Chords may repeat across slots. */
export function assignChord(set: ChordSet, slot: SlotId, chord: ChordName | null): ChordSet {
  const chords = { ...set.chords };
  if (chord) chords[slot] = chord;
  else delete chords[slot];
  return { ...set, chords };
}

/** The active fixed chord set, or null in scale mode. */
export function activeChordSet(settings: Settings): ChordSet | null {
  return settings.chordSets.find((set) => set.id === settings.activeSet) ?? null;
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
  const s = { ...DEFAULT_SETTINGS, mapping: { ...DEFAULT_SETTINGS.mapping }, chordPlayer: { ...DEFAULT_SETTINGS.chordPlayer } };
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

  // Chord sets: keep the built-in sets, applying any valid stored slot → chord choices.
  if (Array.isArray(r.chordSets)) {
    const stored = r.chordSets as { id?: unknown; chords?: unknown }[];
    s.chordSets = DEFAULT_CHORD_SETS.map((def) => {
      const saved = stored.find((x) => x?.id === def.id);
      if (!saved || typeof saved.chords !== "object" || saved.chords === null) return { ...def, chords: { ...def.chords } };
      const chords: ChordSet["chords"] = {};
      for (const { id } of SLOTS) {
        const c = (saved.chords as Record<string, unknown>)[id];
        if (isChordName(c)) chords[id] = c;
      }
      return { ...def, chords };
    });
  }
  if (typeof r.activeSet === "string" && (r.activeSet === SCALE_SET || s.chordSets.some((x) => x.id === r.activeSet))) {
    s.activeSet = r.activeSet;
  }

  if (typeof r.chordPlayer === "object" && r.chordPlayer !== null) {
    const p = r.chordPlayer as Record<string, unknown>;
    if (typeof p.progression === "string") s.chordPlayer.progression = p.progression.slice(0, 200);
    if (isNum(p.bpm)) s.chordPlayer.bpm = Math.round(clamp(p.bpm, LIMITS.bpm));
    if ((BEATS_PER_CHORD_OPTIONS as readonly unknown[]).includes(p.beatsPerChord)) {
      s.chordPlayer.beatsPerChord = p.beatsPerChord as ChordPlayerSettings["beatsPerChord"];
    }
    if (typeof p.click === "boolean") s.chordPlayer.click = p.click;
  }

  const c = r.calibration as Record<string, unknown> | null | undefined;
  if (c && isNum(c.start) && isNum(c.release) && c.start > 0 && c.release > c.start && c.release < 1.5) {
    s.calibration = { start: c.start, release: c.release };
  }
  return s;
}
