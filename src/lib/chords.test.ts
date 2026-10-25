import { describe, expect, it } from "vitest";
import { CHORD_NAMES, chordLabel, chordNotes, diatonicTriad, strumVoicing, topStrings, type ChordName } from "./chords";
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
    ["Am", ["A", "C", "E"]],
    ["A", ["A", "C#", "E"]],
    ["F", ["A", "C", "F"]],
    ["B", ["B", "D#", "F#"]],
    ["E", ["B", "E", "G#"]],
    ["Dm", ["A", "D", "F"]],
    ["Fmaj7", ["A", "C", "E", "F"]],
    ["Am7", ["A", "C", "E", "G"]],
    ["Em7", ["B", "D", "E", "G"]],
    ["E7", ["B", "D", "E", "G#"]],
    ["A7", ["A", "C#", "E", "G"]],
    ["D7", ["A", "C", "D", "F#"]],
    ["G7", ["B", "D", "F", "G"]],
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
  const show = (ms: (number | null)[]) => ms.map((m) => (m === null ? "x" : noteName(m)));

  it("the landing plays only the top four strings", () => {
    expect(show(topStrings("Bm", 4))).toEqual(["x", "x", "F#3", "B3", "D4", "F#4"]);
    expect(show(topStrings("Cm", 4))).toEqual(["x", "x", "G3", "C4", "D#4", "G4"]);
  });

  it("Cm is the Bm barre shape one fret up", () => {
    expect(chordNotes("Cm")).toEqual(chordNotes("Bm").map((m) => m + 1));
  });
});

describe("chord library", () => {
  it("has every chord in the two default sets", () => {
    for (const c of ["C", "Am", "A", "D", "G", "Em", "F", "Bm", "Cmaj7", "B", "Cm"]) expect(CHORD_NAMES).toContain(c);
  });

  it("every shape has the root as its lowest note", () => {
    for (const name of CHORD_NAMES) {
      const root = name.match(/^[A-G]#?/)![0];
      expect(noteName(chordNotes(name)[0], { octave: false })).toBe(root);
    }
  });
});

describe("chordLabel", () => {
  it("names the diatonic chords of E minor pentatonic", () => {
    expect([4, 7, 9, 11, 2].map((pc) => chordLabel(pc, diatonicTriad(pc, "minorPentatonic", 4)))).toEqual([
      "Em",
      "G",
      "Am",
      "Bm",
      "D",
    ]);
  });

  it("marks diminished and augmented chords", () => {
    expect(chordLabel(6, diatonicTriad(6, "major", 7))).toBe("F#°");
    expect(chordLabel(0, { third: 4, fifth: 8 })).toBe("C+");
  });
});
