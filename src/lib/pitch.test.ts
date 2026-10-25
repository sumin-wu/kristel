import { describe, expect, it } from "vitest";
import {
  TUNINGS,
  chordToMidi,
  fretToMidi,
  midiToHz,
  noteName,
  pitchForString,
} from "./pitch";

describe("tunings", () => {
  it("standard tuning is E2 A2 D3 G3 B3 E4", () => {
    expect(TUNINGS.standard).toEqual([40, 45, 50, 55, 59, 64]);
    expect(TUNINGS.standard.map((m) => noteName(m))).toEqual(["E2", "A2", "D3", "G3", "B3", "E4"]);
  });

  it("drop D only lowers the low string", () => {
    expect(TUNINGS.dropD.map((m) => noteName(m))).toEqual(["D2", "A2", "D3", "G3", "B3", "E4"]);
  });

  it("every preset has six strings", () => {
    for (const t of Object.values(TUNINGS)) expect(t).toHaveLength(6);
  });
});

describe("fretToMidi", () => {
  it("adds the fret to the open string", () => {
    expect(fretToMidi(TUNINGS.standard, 0, 0)).toBe(40);
    expect(fretToMidi(TUNINGS.standard, 5, 15)).toBe(79);
  });

  it("throws for a missing string", () => {
    expect(() => fretToMidi(TUNINGS.standard, 6, 0)).toThrow(RangeError);
  });
});

describe("chordToMidi", () => {
  it("G major 3-2-0-0-0-3 yields G2 B2 D3 G3 B3 G4", () => {
    const midi = chordToMidi(TUNINGS.standard, [3, 2, 0, 0, 0, 3]);
    expect(midi).toEqual([43, 47, 50, 55, 59, 67]);
    expect(midi.map((m) => noteName(m!))).toEqual(["G2", "B2", "D3", "G3", "B3", "G4"]);
  });

  it("keeps muted strings as null", () => {
    expect(chordToMidi(TUNINGS.standard, [null, 3, 2, 0, 1, 0])).toEqual([null, 48, 52, 55, 60, 64]);
  });
});

describe("pitchForString", () => {
  it("uses the open string when nothing is held", () => {
    expect(pitchForString(TUNINGS.standard, 1, [])).toBe(45);
  });

  it("uses the highest held fret", () => {
    expect(pitchForString(TUNINGS.standard, 2, [2, 5, 3])).toBe(55);
  });
});

describe("midiToHz", () => {
  it("A4 is 440 Hz", () => {
    expect(midiToHz(69)).toBe(440);
  });

  it("E2 is ~82.41 Hz", () => {
    expect(midiToHz(40)).toBeCloseTo(82.407, 2);
  });
});

describe("noteName", () => {
  it("names notes with sharps and octaves", () => {
    expect(noteName(40)).toBe("E2");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(60)).toBe("C4");
    expect(noteName(59)).toBe("B3");
  });

  it("can omit the octave", () => {
    expect(noteName(66, { octave: false })).toBe("F#");
  });
});
