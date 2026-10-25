// Pure pitch helpers. String index 0 = low E ... 5 = high E.

export type Tuning = readonly number[];

export const TUNINGS = {
  standard: [40, 45, 50, 55, 59, 64],
  dropD: [38, 45, 50, 55, 59, 64],
  halfStepDown: [39, 44, 49, 54, 58, 63],
  openG: [38, 43, 50, 55, 59, 62],
  dadgad: [38, 45, 50, 55, 57, 62],
} as const satisfies Record<string, Tuning>;

export type TuningName = keyof typeof TUNINGS;

export const STRING_COUNT = 6;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function fretToMidi(tuning: Tuning, string: number, fret: number): number {
  const open = tuning[string];
  if (open === undefined) throw new RangeError(`No string ${string} in tuning`);
  return open + fret;
}

/** Frets listed low string → high string; null = muted string. */
export function chordToMidi(tuning: Tuning, frets: readonly (number | null)[]): (number | null)[] {
  return frets.map((f, s) => (f === null ? null : fretToMidi(tuning, s, f)));
}

/** Open string + highest held fret; open string if nothing is held. */
export function pitchForString(tuning: Tuning, string: number, heldFrets: Iterable<number>): number {
  let highest = 0;
  for (const f of heldFrets) if (f > highest) highest = f;
  return fretToMidi(tuning, string, highest);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteName(midi: number, { octave = true }: { octave?: boolean } = {}): string {
  const pc = ((midi % 12) + 12) % 12;
  const name = NOTE_NAMES[pc];
  return octave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}
