import { describe, expect, it } from "vitest";
import { PinchDetector, pinchRatios, pinchedFingers, type Point3 } from "./pinch";

/** An open hand of size 1 (wrist → middle knuckle), fingertips well away from the thumb. */
function hand(pinched: Partial<Record<number, number>> = {}): Point3[] {
  const pts: Point3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  pts[9] = { x: 0, y: -1, z: 0 }; // middle MCP: hand size 1
  pts[4] = { x: -0.8, y: -1.2, z: 0 }; // thumb tip
  const tips = [8, 12, 16, 20];
  tips.forEach((tip, f) => {
    const ratio = pinched[f] ?? 1.2;
    pts[tip] = { x: -0.8 + ratio, y: -1.2, z: 0 };
  });
  return pts;
}

const feed = (d: PinchDetector, frames: (Point3[] | null)[]) => frames.map((f) => d.update(f));

describe("pinchRatios", () => {
  it("normalizes thumb-to-tip distance by hand size", () => {
    const r = pinchRatios(hand({ 1: 0.1 }));
    expect(r[1]).toBeCloseTo(0.1);
    expect(r[0]).toBeCloseTo(1.2);
  });

  it("is scale invariant", () => {
    const big = hand({ 2: 0.2 }).map((p) => ({ x: p.x * 3, y: p.y * 3, z: p.z * 3 }));
    expect(pinchRatios(big)[2]).toBeCloseTo(0.2);
  });
});

describe("pinchedFingers", () => {
  it("lists every finger below 0.25", () => {
    expect(pinchedFingers(hand())).toEqual([]);
    expect(pinchedFingers(hand({ 0: 0.1 }))).toEqual([0]);
    expect(pinchedFingers(hand({ 1: 0.2, 3: 0.05 }))).toEqual([1, 3]);
  });

  it("treats exactly 0.25 as not pinched", () => {
    expect(pinchedFingers(hand({ 2: 0.25 }))).toEqual([]);
  });
});

describe("PinchDetector", () => {
  it("reports no pinch for an open hand or no hand", () => {
    const d = new PinchDetector();
    expect(feed(d, [hand(), hand(), null, null])).toEqual([null, null, null, null]);
  });

  it("needs two frames to close a pinch", () => {
    const d = new PinchDetector();
    expect(feed(d, [hand({ 0: 0.1 }), hand({ 0: 0.1 })])).toEqual([null, 0]);
  });

  it("maps each finger to its column", () => {
    for (const f of [0, 1, 2, 3]) {
      const d = new PinchDetector();
      expect(feed(d, [hand({ [f]: 0.1 }), hand({ [f]: 0.1 })]).at(-1)).toBe(f);
    }
  });

  it("picks the closest finger when several are near the thumb", () => {
    const d = new PinchDetector();
    expect(feed(d, [hand({ 1: 0.3, 2: 0.1 }), hand({ 1: 0.3, 2: 0.1 })]).at(-1)).toBe(2);
  });

  it("holds through the hysteresis band and brief dropouts", () => {
    const d = new PinchDetector();
    feed(d, [hand({ 0: 0.1 }), hand({ 0: 0.1 })]);
    // 0.45 is above `on` but below `off`: still pinched.
    expect(feed(d, [hand({ 0: 0.45 }), null, null, hand({ 0: 0.2 })])).toEqual([0, 0, 0, 0]);
  });

  it("releases after the pinch stays open for three frames", () => {
    const d = new PinchDetector();
    feed(d, [hand({ 0: 0.1 }), hand({ 0: 0.1 })]);
    expect(feed(d, [hand(), hand(), hand()])).toEqual([0, 0, null]);
  });

  it("releases when the hand disappears", () => {
    const d = new PinchDetector();
    feed(d, [hand({ 3: 0.1 }), hand({ 3: 0.1 })]);
    expect(feed(d, [null, null, null])).toEqual([3, 3, null]);
  });

  it("ignores a one-frame flicker", () => {
    const d = new PinchDetector();
    expect(feed(d, [hand({ 0: 0.1 }), hand(), hand({ 1: 0.1 }), hand()])).toEqual([null, null, null, null]);
  });
});
