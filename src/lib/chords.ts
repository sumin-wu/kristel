// Open-position guitar chord voicings in standard tuning, as MIDI notes low → high.

import type { ScaleName } from "./gesture";
import { TUNINGS, chordToMidi } from "./pitch";

/** Frets low E → high E; null = string not played. */
type Shape = readonly (number | null)[];

const SHAPES = {
  Em: [0, 2, 2, 0, 0, 0],
  Cmaj7: [null, 3, 2, 0, 0, 0],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  C: [null, 3, 2, 0, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  D: [null, null, 0, 2, 3, 2],
  // Four-string minor shapes a fret apart (landing page: Bm strums into Cm).
  Bm: [null, null, 4, 4, 3, 2],
  Cm: [null, null, 5, 5, 4, 3],
} as const satisfies Record<string, Shape>;

export type ChordName = keyof typeof SHAPES;

export function chordShape(name: ChordName): Shape {
  return SHAPES[name];
}

/** Per-string notes (low E → high E), null for strings not played. */
export function chordStrings(name: ChordName): (number | null)[] {
  return chordToMidi(TUNINGS.standard, SHAPES[name]);
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
