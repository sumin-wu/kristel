import { describe, expect, it } from "vitest";
import { calibrateThresholds } from "./calibration";
import { DEFAULT_SETTINGS, assignTarget, parseSettings, pinchThresholds } from "./settings";

describe("assignTarget", () => {
  it("reassigns a gesture to a free target", () => {
    const m = assignTarget(DEFAULT_SETTINGS.mapping, "openness", "vibrato");
    expect(m.openness).toBe("vibrato");
    expect(m.height).toBe("filter");
  });

  it("swaps when the target is already taken", () => {
    const m = assignTarget(DEFAULT_SETTINGS.mapping, "height", "reverb");
    expect(m.height).toBe("reverb");
    expect(m.handDistance).toBe("filter");
  });

  it("does not mutate the input", () => {
    const before = { ...DEFAULT_SETTINGS.mapping };
    assignTarget(DEFAULT_SETTINGS.mapping, "roll", "filter");
    expect(DEFAULT_SETTINGS.mapping).toEqual(before);
  });
});

describe("parseSettings", () => {
  it("old voice names fall back to the default Telecaster", () => {
    expect(parseSettings({ preset: "overdriveLead" }).preset).toBe("teleClean");
  });

  it("returns defaults for junk", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and drops invalid ones", () => {
    const s = parseSettings({ preset: "teleCrunch", scale: "lydian", key: 9, bendRange: 99, glideMs: "fast" });
    expect(s.preset).toBe("teleCrunch");
    expect(s.scale).toBe("minorPentatonic");
    expect(s.key).toBe(9);
    expect(s.bendRange).toBe(4);
    expect(s.glideMs).toBe(DEFAULT_SETTINGS.glideMs);
  });

  it("keeps the mapping one-to-one even if storage has duplicates", () => {
    const s = parseSettings({ mapping: { height: "reverb", handDistance: "reverb" } });
    const targets = Object.values(s.mapping);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("validates calibration", () => {
    expect(parseSettings({ calibration: { start: 0.3, release: 0.45 } }).calibration).toEqual({ start: 0.3, release: 0.45 });
    expect(parseSettings({ calibration: { start: 0.5, release: 0.2 } }).calibration).toBeNull();
  });

  it("round-trips through JSON", () => {
    const s = { ...DEFAULT_SETTINGS, preset: "teleTwang" as const, showDebug: false, guideSeen: true };
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("pinchThresholds", () => {
  it("defaults to start 0.25 / release 0.35", () => {
    expect(pinchThresholds(DEFAULT_SETTINGS)).toEqual({ start: 0.25, release: 0.35 });
  });

  it("scales calibrated thresholds by sensitivity", () => {
    const t = pinchThresholds({ ...DEFAULT_SETTINGS, calibration: { start: 0.3, release: 0.4 }, pinchSensitivity: 1.5 });
    expect(t.start).toBeCloseTo(0.45);
    expect(t.release).toBeCloseTo(0.6);
  });
});

describe("calibrateThresholds", () => {
  const repeat = (v: number, n = 20) => Array.from({ length: n }, (_, i) => v + (i % 3) * 0.01);

  it("places thresholds between the user's pinched and open levels", () => {
    const t = calibrateThresholds(repeat(0.9), repeat(0.1))!;
    expect(t.start).toBeGreaterThan(0.1);
    expect(t.start).toBeLessThan(t.release);
    expect(t.release).toBeLessThan(0.9);
  });

  it("tolerates a late pinch", () => {
    const pinch = [...repeat(0.9, 8), ...repeat(0.12, 14)];
    const t = calibrateThresholds(repeat(0.9), pinch)!;
    expect(t.start).toBeLessThan(0.4);
  });

  it("fails when phases look the same or there are too few frames", () => {
    expect(calibrateThresholds(repeat(0.5), repeat(0.45))).toBeNull();
    expect(calibrateThresholds(repeat(0.9, 3), repeat(0.1, 3))).toBeNull();
  });
});
