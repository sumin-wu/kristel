import { describe, expect, it } from "vitest";
import {
  FistDetector,
  PARAM_DEFAULTS,
  Smoothed,
  resolveParams,
  angleDelta,
  handDistanceToWet,
  handOpenness,
  heightToCutoff,
  lerp,
  opennessToDistortion,
  rollAngle,
  rollToBend,
} from "./controls";
import type { Point3 } from "./pinch";

describe("smoothing", () => {
  it("lerps 15% toward the target each update", () => {
    expect(lerp(0, 100, 0.15)).toBe(15);
    const s = new Smoothed(0);
    expect(s.update(100)).toBeCloseTo(15);
    expect(s.update(100)).toBeCloseTo(27.75);
  });

  it("holds when the target is missing", () => {
    const s = new Smoothed(42);
    expect(s.update(null)).toBe(42);
  });
});

describe("heightToCutoff", () => {
  it("spans 200 Hz (low hand) to 8 kHz (high hand)", () => {
    expect(heightToCutoff(0.95)).toBeCloseTo(200);
    expect(heightToCutoff(0.05)).toBeCloseTo(8000);
  });

  it("is logarithmic: the midpoint is the geometric mean", () => {
    expect(heightToCutoff(0.5)).toBeCloseTo(Math.sqrt(200 * 8000));
  });
});

describe("handDistanceToWet", () => {
  it("maps close hands to dry and far hands to 60% wet", () => {
    expect(handDistanceToWet(0.05)).toBe(0);
    expect(handDistanceToWet(1)).toBe(0.6);
    expect(handDistanceToWet(0.45)).toBeCloseTo(0.3);
  });
});

describe("hand openness → distortion", () => {
  const hand = (tipDistance: number): Point3[] => {
    const pts: Point3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    pts[9] = { x: 0, y: -1, z: 0 };
    for (const t of [8, 12, 16, 20]) pts[t] = { x: 0, y: -tipDistance, z: 0 };
    return pts;
  };

  it("measures fingertip distance relative to hand size", () => {
    expect(handOpenness(hand(2))).toBeCloseTo(2);
  });

  it("fist = clean, open hand = full drive", () => {
    expect(opennessToDistortion(handOpenness(hand(0.8)))).toBe(0);
    expect(opennessToDistortion(handOpenness(hand(2)))).toBe(1);
  });
});

describe("roll and bend", () => {
  const knuckles = (ax: number, ay: number, bx: number, by: number) => {
    const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    pts[5] = { x: ax, y: ay };
    pts[17] = { x: bx, y: by };
    return pts;
  };

  it("measures the knuckle-line angle in the mirrored view", () => {
    // Pinky knuckle left of index knuckle in the raw image = to the right for the player.
    expect(rollAngle(knuckles(0.6, 0.5, 0.5, 0.5), 1)).toBeCloseTo(0);
    expect(rollAngle(knuckles(0.5, 0.5, 0.5, 0.6), 1)).toBeCloseTo(Math.PI / 2);
  });

  it("corrects for the video aspect ratio", () => {
    expect(rollAngle(knuckles(0.6, 0.5, 0.5, 0.6), 16 / 9)).toBeCloseTo(Math.atan2(0.1, 0.1 * (16 / 9)));
  });

  it("wraps angle differences", () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(0.3, 0.1)).toBeCloseTo(0.2);
  });

  it("bends up to ±2 semitones with a dead zone", () => {
    expect(rollToBend(0.02)).toBe(0);
    expect(rollToBend(Math.PI / 6)).toBeCloseTo(2);
    expect(rollToBend(-Math.PI)).toBe(-2);
    expect(rollToBend(0.3)).toBeGreaterThan(0);
    expect(rollToBend(0.3)).toBeLessThan(2);
  });
});

describe("resolveParams", () => {
  const values = { height: 1, roll: -0.5, handDistance: 0.5, openness: 0 };
  const mapping = { height: "filter", roll: "bend", handDistance: "reverb", openness: "distortion" } as const;

  it("applies the default mapping", () => {
    const p = resolveParams(values, mapping, 2);
    expect(p.cutoff).toBeCloseTo(8000);
    expect(p.bend).toBeCloseTo(-1);
    expect(p.reverbWet).toBeCloseTo(0.3);
    expect(p.distortion).toBe(0);
    expect(p.vibrato).toBe(0);
  });

  it("scales bend by the bend range", () => {
    expect(resolveParams(values, mapping, 4).bend).toBeCloseTo(-2);
  });

  it("leaves unmapped targets at their defaults", () => {
    const p = resolveParams(values, { ...mapping, openness: "vibrato" }, 2);
    expect(p.distortion).toBe(PARAM_DEFAULTS.distortion);
    expect(p.vibrato).toBe(0);
  });

  it("uses roll magnitude for one-sided targets and centers unipolar gestures for bend", () => {
    const p = resolveParams(values, { height: "bend", roll: "vibrato", handDistance: "reverb", openness: "filter" }, 2);
    expect(p.vibrato).toBeCloseTo(0.5);
    expect(p.bend).toBeCloseTo(2);
    expect(p.cutoff).toBeCloseTo(200);
  });
});

describe("FistDetector", () => {
  const run = (d: FistDetector, xs: (number | null)[]) => xs.map((x) => d.update(x));

  it("needs three closed frames to count as a fist", () => {
    expect(run(new FistDetector(), [0.9, 0.9, 0.9])).toEqual([false, false, true]);
  });

  it("ignores a one-frame dip (e.g. passing through a pinch)", () => {
    expect(run(new FistDetector(), [1.8, 0.9, 1.8, 0.9, 1.8])).toEqual([false, false, false, false, false]);
  });

  it("stays closed through the hysteresis band, opens above it", () => {
    const d = new FistDetector();
    run(d, [0.9, 0.9, 0.9]);
    expect(run(d, [1.2, 1.3, 1.5, 1.5, 1.5])).toEqual([true, true, true, true, false]);
  });

  it("opens immediately when the hand is lost", () => {
    const d = new FistDetector();
    run(d, [0.9, 0.9, 0.9]);
    expect(d.update(null)).toBe(false);
  });
});
