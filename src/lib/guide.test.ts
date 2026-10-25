import { describe, expect, it } from "vitest";
import { degreeToMidi } from "./gesture";
import { GUIDE_START, GUIDE_STEPS, advanceGuide, isGuideFinished, type GuideEvent, type GuideState } from "./guide";

const run = (events: GuideEvent[], from: GuideState = GUIDE_START) =>
  events.reduce((s, e) => advanceGuide(s, e), from);
const note = (degree: number, octave = 3): GuideEvent => ({
  type: "note",
  degree,
  octave,
  midi: degreeToMidi(degree, octave),
});
const both: GuideEvent = { type: "hands", left: true, right: true };
const songStep = GUIDE_STEPS.findIndex((s) => s.id === "song");
/** A note event as the synth would produce it in G major. */
const gMajor = (degree: number): GuideEvent => ({ type: "note", degree, octave: 3, midi: degreeToMidi(degree, 3, "major", 7) });

describe("advanceGuide", () => {
  it("needs both hands to finish the first step, seen together or one at a time", () => {
    expect(run([{ type: "hands", left: false, right: true }]).step).toBe(0);
    expect(run([both]).step).toBe(1);
    expect(run([{ type: "hands", left: false, right: true }, { type: "hands", left: true, right: false }]).step).toBe(1);
  });

  it("ignores notes before the hands step is done", () => {
    expect(run([note(1)])).toEqual(GUIDE_START);
  });

  it("tracks partial progress within a step", () => {
    expect(run([both, note(1), note(3)])).toEqual({ step: 2, done: ["Ring"], miss: false });
  });

  it("wrong notes don't advance", () => {
    expect(run([both, note(4), note(5), { type: "glide" }]).step).toBe(1);
  });

  it("walks the lessons up to the song", () => {
    const s = run([both, note(1), note(2), note(4), note(3), note(5), { type: "glide" }, note(2, 4)]);
    expect(s.step).toBe(songStep);
  });
});

describe("song step", () => {
  const atSong: GuideState = { step: songStep, done: [], miss: false };

  it("switches to G major so every root is on a pinch", () => {
    expect(GUIDE_STEPS[songStep].settings).toEqual({ key: 7, scale: "major" });
  });

  it("plays C G C G D in order: pinky, index, pinky, index, index+middle", () => {
    const s = run([gMajor(4), gMajor(1), gMajor(4), gMajor(1), gMajor(5)], atSong);
    expect(isGuideFinished(s)).toBe(true);
  });

  it("a wrong note flags a miss and keeps your place", () => {
    const s = run([gMajor(4), gMajor(2)], atSong);
    expect(s).toEqual({ step: songStep, done: ["Cmaj7"], miss: true });
    expect(run([gMajor(1)], s)).toEqual({ step: songStep, done: ["Cmaj7", "Gmaj7"], miss: false });
  });

  it("any octave of the right note counts", () => {
    const highC: GuideEvent = { type: "note", degree: 4, octave: 4, midi: degreeToMidi(4, 4, "major", 7) };
    expect(run([highC], atSong).done).toEqual(["Cmaj7"]);
  });

  it("does nothing once finished", () => {
    const finished: GuideState = { step: GUIDE_STEPS.length, done: [], miss: false };
    expect(advanceGuide(finished, note(1))).toBe(finished);
  });
});
