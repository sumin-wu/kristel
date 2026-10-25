import { describe, expect, it } from "vitest";
import { chordPositionAt, chordStartTime, rescaleForTempo, secondsPerBeat } from "./chordPlayer";

describe("chordPositionAt", () => {
  // 120 BPM = 0.5 s per beat; 4 beats per chord = 2 s per chord; 5 chords = 10 s per loop.
  const at = (s: number) => chordPositionAt(s, 120, 4, 5);

  it("starts on the first beat of the first chord", () => {
    expect(at(0)).toEqual({ index: 0, beat: 0, loop: 0 });
  });

  it("counts beats within a chord", () => {
    expect(at(0.5)).toEqual({ index: 0, beat: 1, loop: 0 });
    expect(at(1.99)).toEqual({ index: 0, beat: 3, loop: 0 });
  });

  it("moves to the next chord every 4 beats", () => {
    expect(at(2)).toEqual({ index: 1, beat: 0, loop: 0 });
    expect(at(9.5)).toEqual({ index: 4, beat: 3, loop: 0 });
  });

  it("loops the progression", () => {
    expect(at(10)).toEqual({ index: 0, beat: 0, loop: 1 });
    expect(at(23)).toEqual({ index: 1, beat: 2, loop: 2 });
  });

  it("is null with no chords", () => {
    expect(chordPositionAt(3, 120, 4, 0)).toBeNull();
  });
});

describe("tempo helpers", () => {
  it("converts BPM to seconds per beat", () => {
    expect(secondsPerBeat(60)).toBe(1);
    expect(secondsPerBeat(120)).toBe(0.5);
  });

  it("finds where each chord starts", () => {
    expect(chordStartTime(3, 120, 4)).toBe(6);
  });

  it("keeps your place when the tempo changes", () => {
    const before = chordPositionAt(5, 120, 4, 5);
    const after = chordPositionAt(rescaleForTempo(5, 120, 80), 80, 4, 5);
    expect(after).toEqual(before);
  });
});
