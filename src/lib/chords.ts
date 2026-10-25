// Open-position guitar chord voicings in standard tuning, as MIDI notes low → high.

import type { ScaleName } from "./gesture";
import { TUNINGS, chordToMidi } from "./pitch";

/** Frets low E → high E; null = string not played. */
type Shape = readonly (number | null)[];

const SHAPES = {
  C: [null, 3, 2, 0, 1, 0],
  Cm: [null, 3, 5, 5, 4, 3],
  Cmaj7: [null, 3, 2, 0, 0, 0],
  D: [null, null, 0, 2, 3, 2],
  Dm: [null, null, 0, 2, 3, 1],
  D7: [null, null, 0, 2, 1, 2],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  Em7: [0, 2, 2, 0, 3, 0],
  E7: [0, 2, 0, 1, 0, 0],
  F: [1, 3, 3, 2, 1, 1],
  Fmaj7: [null, null, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  G7: [3, 2, 0, 0, 0, 1],
  A: [null, 0, 2, 2, 2, 0],
  Am: [null, 0, 2, 2, 1, 0],
  Am7: [null, 0, 2, 0, 1, 0],
  A7: [null, 0, 2, 0, 2, 0],
  B: [null, 2, 4, 4, 4, 2],
  Bm: [null, 2, 4, 4, 3, 2],
} as const satisfies Record<string, Shape>;

export type ChordName = keyof typeof SHAPES;

export function chordShape(name: ChordName): Shape {
  return SHAPES[name];
}

/** Every chord shape, in a sensible order for pickers. */
export const CHORD_NAMES = Object.keys(SHAPES) as ChordName[];

export function isChordName(v: unknown): v is ChordName {
  return typeof v === "string" && Object.hasOwn(SHAPES, v);
}

/** Per-string notes (low E → high E), null for strings not played. */
export function chordStrings(name: ChordName): (number | null)[] {
  return chordToMidi(TUNINGS.standard, SHAPES[name]);
}

/** Only the top `count` strings of a shape (the rest muted), e.g. a light four-string strum. */
export function topStrings(name: ChordName, count: number): (number | null)[] {
  return chordStrings(name).map((m, i) => (i < 6 - count ? null : m));
}

/** The chord's sounding notes, low → high (a downstroke strums them in this order). */
export function chordNotes(name: ChordName): number[] {
  return chordToMidi(TUNINGS.standard, SHAPES[name]).filter((m): m is number => m !== null);
}

// ---- Chords built on any scale note, voiced like a guitar strum ----

/** Seven-note parent scale used to pick chord qualities (pentatonic/blues borrow natural minor). */
const PARENT_SCALES: Record<ScaleName, readonly number[]> = {
  minorPentatonic: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

/** Third and fifth (semitones above the root) of the diatonic triad on `rootPc` in the key. */
export function diatonicTriad(rootPc: number, scale: ScaleName, key: number): { third: number; fifth: number } {
  const parent = PARENT_SCALES[scale];
  const i = parent.indexOf((((rootPc - key) % 12) + 12) % 12);
  if (i < 0) return { third: 4, fifth: 7 }; // outside the scale (e.g. the blue note): plain major
  const above = (steps: number) => (((parent[(i + steps) % 7] - parent[i]) % 12) + 12) % 12;
  return { third: above(2), fifth: above(4) };
}

/**
 * A movable open/barre voicing for a triad on `rootPc`, low → high: the E shape
 * for roots E–G# (6 strings), the A shape for A–D# (5 strings), both at frets 0–6.
 * `octaveShift` moves the whole chord up by octaves.
 */
export function strumVoicing(rootPc: number, { third, fifth }: { third: number; fifth: number }, octaveShift = 0): number[] {
  const fromE = (((rootPc - 4) % 12) + 12) % 12;
  const shift = 12 * octaveShift;
  if (fromE <= 4) {
    const b = 40 + fromE; // E-shape barre on the low E string
    return [b, b + fifth, b + 12, b + 12 + third, b + 12 + fifth, b + 24].map((m) => m + shift);
  }
  const b = 45 + ((((rootPc - 9) % 12) + 12) % 12); // A-shape barre on the A string
  return [b, b + fifth, b + 12, b + 12 + third, b + 12 + fifth].map((m) => m + shift);
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A short chord name for a triad on `rootPc`: "G", "Am", "B°", "C+". */
export function chordLabel(rootPc: number, { third, fifth }: { third: number; fifth: number }): string {
  const root = PITCH_NAMES[((rootPc % 12) + 12) % 12];
  if (third === 3 && fifth === 6) return `${root}°`;
  if (third === 4 && fifth === 8) return `${root}+`;
  return third === 3 ? `${root}m` : root;
}
