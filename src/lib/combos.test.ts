import { describe, expect, it } from "vitest";
import { ComboDetector, SLOTS, slotDegree, slotFingers, slotFromMask, slotMask } from "./combos";
import type { PinchFrame } from "./gesture";

const frame = (pinched: number[], started: number[] = [], velocity = 0.7): PinchFrame => ({
  pinched: [0, 1, 2, 3].map((f) => pinched.includes(f)),
  started: started.map((finger) => ({ finger, velocity })),
});

describe("slots", () => {
  it("round-trips ids, masks and fingers", () => {
    for (const { id } of SLOTS) {
      expect(slotFromMask(slotMask(id))).toBe(id);
      expect(slotFingers(id).reduce((m, f) => m | (1 << f), 0)).toBe(slotMask(id));
    }
  });

  it("labels combos readably", () => {
    expect(SLOTS.find((s) => s.id === "MR")?.label).toBe("Middle + Ring");
    expect(SLOTS.find((s) => s.id === "IMRP")?.label).toBe("All four");
  });

  it("maps the scale-mode slots to degrees", () => {
    expect(["I", "M", "R", "P", "IM"].map((s) => slotDegree(s as never))).toEqual([1, 2, 3, 4, 5]);
    expect(slotDegree("MR")).toBeNull();
  });
});

describe("ComboDetector", () => {
  it("a single pinch fires once the window passes", () => {
    const d = new ComboDetector(70);
    expect(d.update(frame([0], [0]), 0)).toEqual([]);
    expect(d.update(frame([0]), 33)).toEqual([]);
    expect(d.update(frame([0]), 80)).toEqual([{ slot: "I", velocity: 0.7 }]);
    expect(d.update(frame([0]), 120)).toEqual([]);
  });

  it("fingers landing a frame apart make one combo", () => {
    const d = new ComboDetector(70);
    d.update(frame([1], [1], 0.5), 0);
    d.update(frame([1, 2], [2], 0.9), 33);
    expect(d.update(frame([1, 2]), 80)).toEqual([{ slot: "MR", velocity: 0.9 }]);
  });

  it("three-finger combos", () => {
    const d = new ComboDetector(70);
    d.update(frame([0, 1, 2], [0, 1, 2]), 0);
    expect(d.update(frame([0, 1, 2]), 75)).toEqual([{ slot: "IMR", velocity: 0.7 }]);
  });

  it("adding a finger to a held pinch fires the bigger combo", () => {
    const d = new ComboDetector(70);
    d.update(frame([0], [0]), 0);
    expect(d.update(frame([0]), 80)).toHaveLength(1);
    d.update(frame([0, 1], [1]), 300);
    expect(d.update(frame([0, 1]), 380)).toEqual([{ slot: "IM", velocity: 0.7 }]);
  });

  it("a quick tap released inside the window still plays", () => {
    const d = new ComboDetector(70);
    d.update(frame([3], [3]), 0);
    expect(d.update(frame([]), 33)).toEqual([{ slot: "P", velocity: 0.7 }]);
  });
});
