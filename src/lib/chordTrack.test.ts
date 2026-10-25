import { describe, expect, it } from "vitest";
import { chordAt, fillProgression, fingeringFor, nextChange, parseProgression, songKey } from "./chordTrack";
import { DEFAULT_CHORD_SETS } from "./settings";

describe("parseProgression", () => {
  it("accepts spaces, commas and dashes, dropping unknown chords", () => {
    expect(parseProgression("Cmaj7 Gmaj7, C - G | D  H7")).toEqual(["Cmaj7", "Gmaj7", "C", "G", "D"]);
  });
});

describe("fillProgression", () => {
  it("puts one chord per sung line, cycling, and skips instrumental lines", () => {
    const lines = ["one", "", "two", "♪", "three", "four"];
    expect(fillProgression(lines, ["C", "G", "D"])).toEqual({ 0: "C", 2: "G", 4: "D", 5: "C" });
  });

  it("returns nothing for an empty progression", () => {
    expect(fillProgression(["a"], [])).toEqual({});
  });
});

describe("chordAt / nextChange", () => {
  const track = { 0: "C", 3: "G", 4: "G", 6: "D" } as const;

  it("carries the last chord forward", () => {
    expect(chordAt(track, -1)).toBeNull();
    expect(chordAt(track, 2)).toBe("C");
    expect(chordAt(track, 5)).toBe("G");
  });

  it("finds the next real change (repeats don't count)", () => {
    expect(nextChange(track, 3, 8)).toEqual({ line: 6, chord: "D" });
    expect(nextChange(track, 6, 8)).toBeNull();
  });
});

describe("fingeringFor", () => {
  const [tele, song] = DEFAULT_CHORD_SETS;

  it("names the finger combo that plays the chord in the set", () => {
    expect(fingeringFor(tele, "G")).toBe("Index + Middle");
    expect(fingeringFor(tele, "Cmaj7")).toBe("Middle + Ring + Pinky");
    expect(fingeringFor(song, "Cm")).toBe("Pinky");
  });

  it("is null when the set lacks the chord, or in scale mode", () => {
    expect(fingeringFor(song, "D")).toBeNull();
    expect(fingeringFor(null, "C")).toBeNull();
  });
});

describe("songKey", () => {
  it("ignores case and surrounding spaces", () => {
    expect(songKey(" Girl In Red ", "We Fell In Love In October")).toBe(songKey("girl in red", "we fell in love in october"));
  });
});
