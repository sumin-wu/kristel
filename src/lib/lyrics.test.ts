import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc, toLyrics } from "./lyrics";

// Made-up lines for testing the format only.
const LRC = ["[00:05.50] first line", "[00:01.00] intro", "[01:02.25] later line", "no timestamp here", "[00:10.00][00:20.00] chorus"].join(
  "\n",
);

describe("parseLrc", () => {
  it("parses timestamps into seconds and sorts by time", () => {
    expect(parseLrc(LRC)).toEqual([
      { time: 1, text: "intro" },
      { time: 5.5, text: "first line" },
      { time: 10, text: "chorus" },
      { time: 20, text: "chorus" },
      { time: 62.25, text: "later line" },
    ]);
  });

  it("keeps empty timed lines as pauses", () => {
    expect(parseLrc("[00:03.00]")).toEqual([{ time: 3, text: "" }]);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc(LRC);

  it("is -1 before the first line", () => {
    expect(activeLineIndex(lines, 0.5)).toBe(-1);
  });

  it("finds the line being sung", () => {
    expect(activeLineIndex(lines, 1)).toBe(0);
    expect(activeLineIndex(lines, 7)).toBe(1);
    expect(activeLineIndex(lines, 15)).toBe(2);
    expect(activeLineIndex(lines, 500)).toBe(4);
  });
});

describe("toLyrics", () => {
  it("prefers synced lines and splits plain lyrics", () => {
    const l = toLyrics({ trackName: "T", artistName: "A", duration: 120, plainLyrics: "a\nb", syncedLyrics: "[00:01.00] a" });
    expect(l.synced).toEqual([{ time: 1, text: "a" }]);
    expect(l.plain).toEqual(["a", "b"]);
    expect(l.duration).toBe(120);
  });

  it("treats empty synced lyrics as missing", () => {
    expect(toLyrics({ trackName: "T", artistName: "A", syncedLyrics: "" }).synced).toBeNull();
  });
});
