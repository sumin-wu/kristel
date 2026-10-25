import { describe, expect, it } from "vitest";
import { noteName } from "./pitch";
import {
  HysteresisPinch,
  LeadController,
  RightHandNotes,
  SCALES,
  scaleIndexToMidi,
  degreeToMidi,
  octaveFor,
  velocityFromSpeed,
  type PinchFrame,
} from "./gesture";

const OPEN = 1.0;
/** Ratios for [index, middle, ring, pinky], open unless given. */
const ratios = (r: Partial<Record<number, number>> = {}) => [0, 1, 2, 3].map((f) => r[f] ?? OPEN);

describe("degreeToMidi", () => {
  it("maps degrees 1–5 to E minor pentatonic", () => {
    expect([1, 2, 3, 4, 5].map((d) => noteName(degreeToMidi(d, 3)))).toEqual(["E3", "G3", "A3", "B3", "D4"]);
    expect([1, 2, 3, 4, 5].map((d) => noteName(degreeToMidi(d, 4)))).toEqual(["E4", "G4", "A4", "B4", "D5"]);
  });

  it("rejects degrees outside 1–5", () => {
    expect(() => degreeToMidi(6, 3)).toThrow(RangeError);
  });
});

describe("octaveFor", () => {
  it("none = 3, index = 4, middle = 5", () => {
    expect(octaveFor(null)).toBe(3);
    expect(octaveFor([false, false, false, false])).toBe(3);
    expect(octaveFor([true, false, false, false])).toBe(4);
    expect(octaveFor([false, true, false, false])).toBe(5);
    expect(octaveFor([true, true, false, false])).toBe(5);
  });
});

describe("velocityFromSpeed", () => {
  it("is soft for slow pinches and full for fast ones", () => {
    expect(velocityFromSpeed(0)).toBe(0.2);
    expect(velocityFromSpeed(6)).toBe(1);
    expect(velocityFromSpeed(3.5)).toBeCloseTo(0.6);
  });
});

describe("HysteresisPinch", () => {
  it("starts below 0.25 and reports the edge once", () => {
    const h = new HysteresisPinch();
    expect(h.update(ratios({ 0: 0.3 }), 0).started).toEqual([]);
    expect(h.update(ratios({ 0: 0.2 }), 33).started.map((s) => s.finger)).toEqual([0]);
    expect(h.update(ratios({ 0: 0.1 }), 66).started).toEqual([]);
  });

  it("holds between 0.25 and 0.35 and releases above 0.35", () => {
    const h = new HysteresisPinch();
    h.update(ratios({ 1: 0.2 }), 0);
    expect(h.update(ratios({ 1: 0.33 }), 33).pinched[1]).toBe(true);
    expect(h.update(ratios({ 1: 0.36 }), 66).pinched[1]).toBe(false);
  });

  it("does not retrigger while hovering around the start threshold", () => {
    const h = new HysteresisPinch();
    const starts = [0.24, 0.27, 0.23, 0.3, 0.22].flatMap((r, i) => h.update(ratios({ 2: r }), i * 33).started);
    expect(starts).toHaveLength(1);
  });

  it("retriggers after a full release", () => {
    const h = new HysteresisPinch();
    const starts = [0.2, 0.5, 0.2].flatMap((r, i) => h.update(ratios({ 0: r }), i * 33).started);
    expect(starts).toHaveLength(2);
  });

  it("fast closes are louder than slow closes", () => {
    const fast = new HysteresisPinch();
    fast.update(ratios({ 0: 0.8 }), 0);
    const [f] = fast.update(ratios({ 0: 0.2 }), 66).started;

    const slow = new HysteresisPinch();
    [0.4, 0.37, 0.34, 0.31, 0.28].forEach((r, i) => slow.update(ratios({ 0: r }), i * 33));
    const [s] = slow.update(ratios({ 0: 0.24 }), 165).started;

    expect(f.velocity).toBe(1);
    expect(s.velocity).toBeLessThan(0.5);
  });

  it("clears everything when the hand disappears", () => {
    const h = new HysteresisPinch();
    h.update(ratios({ 3: 0.1 }), 0);
    expect(h.update(null, 33).pinched).toEqual([false, false, false, false]);
    expect(h.update(ratios({ 3: 0.1 }), 66).started).toHaveLength(1);
  });
});

describe("RightHandNotes", () => {
  const frame = (pinched: number[], started: number[] = [], velocity = 0.7): PinchFrame => ({
    pinched: [0, 1, 2, 3].map((f) => pinched.includes(f)),
    started: started.map((finger) => ({ finger, velocity })),
  });

  it("ring and pinky play degrees 3 and 4 immediately", () => {
    const n = new RightHandNotes();
    expect(n.update(frame([2], [2]), 0)).toEqual([{ degree: 3, velocity: 0.7, fingers: [2] }]);
    expect(n.update(frame([2, 3], [3]), 33)).toEqual([{ degree: 4, velocity: 0.7, fingers: [3] }]);
  });

  it("a lone index plays degree 1 once the chord window passes", () => {
    const n = new RightHandNotes(60);
    expect(n.update(frame([0], [0]), 0)).toEqual([]);
    expect(n.update(frame([0]), 33)).toEqual([]);
    expect(n.update(frame([0]), 66)).toEqual([{ degree: 1, velocity: 0.7, fingers: [0] }]);
    expect(n.update(frame([0]), 99)).toEqual([]);
  });

  it("a lone middle plays degree 2", () => {
    const n = new RightHandNotes(60);
    n.update(frame([1], [1]), 0);
    expect(n.update(frame([1]), 70)).toEqual([{ degree: 2, velocity: 0.7, fingers: [1] }]);
  });

  it("index + middle on the same frame plays degree 5 once", () => {
    const n = new RightHandNotes();
    expect(n.update(frame([0, 1], [0, 1]), 0)).toEqual([{ degree: 5, velocity: 0.7, fingers: [0, 1] }]);
    expect(n.update(frame([0, 1]), 100)).toEqual([]);
  });

  it("index then middle within the window plays only degree 5", () => {
    const n = new RightHandNotes(60);
    expect(n.update(frame([0], [0], 0.4), 0)).toEqual([]);
    expect(n.update(frame([0, 1], [1], 0.9), 33)).toEqual([{ degree: 5, velocity: 0.9, fingers: [0, 1] }]);
    expect(n.update(frame([0, 1]), 100)).toEqual([]);
  });

  it("adding middle while index is already sounding plays degree 5", () => {
    const n = new RightHandNotes(60);
    n.update(frame([0], [0]), 0);
    expect(n.update(frame([0]), 70)).toHaveLength(1);
    expect(n.update(frame([0, 1], [1]), 300)).toEqual([{ degree: 5, velocity: 0.7, fingers: [0, 1] }]);
  });

  it("a quick index tap released inside the window still plays", () => {
    const n = new RightHandNotes(60);
    n.update(frame([0], [0]), 0);
    expect(n.update(frame([]), 33)).toEqual([{ degree: 1, velocity: 0.7, fingers: [0] }]);
  });
});

describe("scales and keys", () => {
  it("major, blues and dorian in E", () => {
    const names = (scale: "major" | "blues" | "dorian", n: number) =>
      Array.from({ length: n }, (_, i) => noteName(scaleIndexToMidi(3 * SCALES[scale].steps.length + i, scale)));
    expect(names("major", 8)).toEqual(["E3", "F#3", "G#3", "A3", "B3", "C#4", "D#4", "E4"]);
    expect(names("blues", 7)).toEqual(["E3", "G3", "A3", "A#3", "B3", "D4", "E4"]);
    expect(names("dorian", 7)).toEqual(["E3", "F#3", "G3", "A3", "B3", "C#4", "D4"]);
  });

  it("transposes by key", () => {
    expect(noteName(degreeToMidi(1, 3, "minorPentatonic", 9))).toBe("A3");
    expect(noteName(degreeToMidi(5, 3, "minorPentatonic", 9))).toBe("G4");
  });

  it("negative indices go below the root octave", () => {
    expect(noteName(scaleIndexToMidi(3 * 5 - 1))).toBe("D3");
  });
});

describe("LeadController", () => {
  const base = { octave: 3, scale: "minorPentatonic" as const, key: 4 };
  const on = (degree: number, fingers = [degree - 1]) => [{ degree, velocity: 0.8, fingers }];
  const pinched = (...f: number[]) => [0, 1, 2, 3].map((i) => f.includes(i));

  it("plays on the trigger and holds while pinched", () => {
    const lead = new LeadController();
    const first = lead.update({ ...base, triggers: on(1), pinched: pinched(0), x: 0.5 });
    expect(first.actions).toEqual([{ type: "on", midi: 52, velocity: 0.8 }]);
    const held = lead.update({ ...base, triggers: [], pinched: pinched(0), x: 0.5 });
    expect(held.actions).toEqual([]);
    expect(held.state.holding).toBe(true);
  });

  it("releases when the pinch opens or the hand is lost", () => {
    const lead = new LeadController();
    lead.update({ ...base, triggers: on(2), pinched: pinched(1), x: 0.5 });
    expect(lead.update({ ...base, triggers: [], pinched: pinched(), x: 0.5 }).actions).toEqual([{ type: "off" }]);

    lead.update({ ...base, triggers: on(2), pinched: pinched(1), x: 0.5 });
    expect(lead.update({ ...base, triggers: [], pinched: pinched(1), x: null }).actions).toEqual([{ type: "off" }]);
  });

  it("an index+middle note holds until both fingers open", () => {
    const lead = new LeadController();
    lead.update({ ...base, triggers: on(5, [0, 1]), pinched: pinched(0, 1), x: 0.5 });
    expect(lead.update({ ...base, triggers: [], pinched: pinched(0), x: 0.5 }).actions).toEqual([]);
    expect(lead.update({ ...base, triggers: [], pinched: pinched(), x: 0.5 }).actions).toEqual([{ type: "off" }]);
  });

  it("slides up and down the scale one step per step width", () => {
    const lead = new LeadController(0.1);
    lead.update({ ...base, triggers: on(1), pinched: pinched(0), x: 0.5 });
    const up = lead.update({ ...base, triggers: [], pinched: pinched(0), x: 0.68 });
    expect(up.actions).toEqual([{ type: "glide", midi: 57 }]); // E3 → A3 (2 steps)
    const down = lead.update({ ...base, triggers: [], pinched: pinched(0), x: 0.4 });
    expect(down.actions).toEqual([{ type: "glide", midi: 50 }]); // one step below E3 = D3
    expect(down.state.steps).toBe(-1);
  });

  it("ignores jitter near a step boundary", () => {
    const lead = new LeadController(0.1);
    lead.update({ ...base, triggers: on(1), pinched: pinched(0), x: 0.5 });
    const jitter = [0.55, 0.56, 0.54, 0.57].flatMap(
      (x) => lead.update({ ...base, triggers: [], pinched: pinched(0), x }).actions,
    );
    expect(jitter).toEqual([]);
  });

  it("a new pinch replaces the held note", () => {
    const lead = new LeadController();
    lead.update({ ...base, triggers: on(1), pinched: pinched(0), x: 0.5 });
    const next = lead.update({ ...base, triggers: on(3), pinched: pinched(0, 2), x: 0.5 });
    expect(next.actions).toEqual([{ type: "on", midi: 57, velocity: 0.8 }]);
  });
});
