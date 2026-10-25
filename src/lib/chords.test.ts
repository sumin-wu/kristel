import { describe, expect, it } from "vitest";
import { chordNotes, chordStrings, diatonicTriad, strumVoicing, type ChordName } from "./chords";
import { noteName } from "./pitch";

const pitchClasses = (name: ChordName) => [...new Set(chordNotes(name).map((m) => noteName(m, { octave: false })))].sort();

describe("chord voicings", () => {
  it.each([
    ["Em", ["B", "E", "G"]],
    ["Cmaj7", ["B", "C", "E", "G"]],
    ["Gmaj7", ["B", "D", "F#", "G"]],
    ["C", ["C", "E", "G"]],
    ["G", ["B", "D", "G"]],
    ["D", ["A", "D", "F#"]],
    ["Bm", ["B", "D", "F#"]],
    ["Cm", ["C", "D#", "G"]],
  ] as const)("%s contains exactly its chord tones", (name, tones) => {
    expect(pitchClasses(name)).toEqual([...tones].sort());
  });

  it("lists notes low to high with the root at the bottom", () => {
    expect(chordNotes("C").map((m) => noteName(m))).toEqual(["C3", "E3", "G3", "C4", "E4"]);
    expect(chordNotes("G").map((m) => noteName(m))).toEqual(["G2", "B2", "D3", "G3", "B3", "G4"]);
    expect(chordNotes("D").map((m) => noteName(m))).toEqual(["D3", "A3", "D4", "F#4"]);
  });

  it("matches the landing page's open E minor", () => {
    expect(chordNotes("Em")).toEqual([40, 47, 52, 55, 59, 64]);
  });
});

describe("diatonicTriad", () => {
  const quality = (t: { third: number; fifth: number }) =>
    t.third === 4 && t.fifth === 7 ? "maj" : t.third === 3 && t.fifth === 7 ? "min" : t.third === 3 && t.fifth === 6 ? "dim" : "?";

  it("G major: G C D are major, A B E minor, F# diminished", () => {
    const q = (pc: number) => quality(diatonicTriad(pc, "major", 7));
    expect([7, 0, 2].map(q)).toEqual(["maj", "maj", "maj"]);
    expect([9, 11, 4].map(q)).toEqual(["min", "min", "min"]);
    expect(q(6)).toBe("dim");
  });

  it("E minor pentatonic borrows natural minor: Em, G, Am, Bm, D", () => {
    const q = (pc: number) => quality(diatonicTriad(pc, "minorPentatonic", 4));
    expect([4, 7, 9, 11, 2].map(q)).toEqual(["min", "maj", "min", "min", "maj"]);
  });

  it("falls back to major outside the scale", () => {
    expect(diatonicTriad(10, "blues", 4)).toEqual({ third: 4, fifth: 7 });
  });
});

describe("strumVoicing", () => {
  const names = (ms: number[]) => ms.map((m) => noteName(m));

  it("E minor and E major are the open E shapes", () => {
    expect(strumVoicing(4, { third: 3, fifth: 7 })).toEqual(chordNotes("Em"));
    expect(names(strumVoicing(4, { third: 4, fifth: 7 }))).toEqual(["E2", "B2", "E3", "G#3", "B3", "E4"]);
  });

  it("G uses the E shape at fret 3; A minor the open A shape", () => {
    expect(names(strumVoicing(7, { third: 4, fifth: 7 }))).toEqual(["G2", "D3", "G3", "B3", "D4", "G4"]);
    expect(names(strumVoicing(9, { third: 3, fifth: 7 }))).toEqual(["A2", "E3", "A3", "C4", "E4"]);
  });

  it("D uses the A shape at fret 5", () => {
    expect(names(strumVoicing(2, { third: 4, fifth: 7 }))).toEqual(["D3", "A3", "D4", "F#4", "A4"]);
  });

  it("shifts by octaves", () => {
    expect(strumVoicing(4, { third: 3, fifth: 7 }, 1)).toEqual(chordNotes("Em").map((m) => m + 12));
  });
});

describe("Bm into Cm (landing page)", () => {
  it("plays only the top four strings", () => {
    expect(chordStrings("Bm").map((m) => (m === null ? "x" : noteName(m)))).toEqual(["x", "x", "F#3", "B3", "D4", "F#4"]);
    expect(chordStrings("Cm").map((m) => (m === null ? "x" : noteName(m)))).toEqual(["x", "x", "G3", "C4", "D#4", "G4"]);
  });

  it("Cm is the same shape one fret up", () => {
    expect(chordNotes("Cm")).toEqual(chordNotes("Bm").map((m) => m + 1));
  });
});
