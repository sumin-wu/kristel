import { describe, expect, it } from "vitest";
import { stringAt, stringsCrossed } from "./strum";

// Six strings top to bottom at y = 100, 120, ... 200 (index 0 = top).
const ys = [100, 120, 140, 160, 180, 200];

describe("stringsCrossed", () => {
  it("downstroke crosses strings top to bottom", () => {
    expect(stringsCrossed(90, 210, ys)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("upstroke crosses strings bottom to top", () => {
    expect(stringsCrossed(210, 90, ys)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it("returns only the strings between the two points", () => {
    expect(stringsCrossed(125, 165, ys)).toEqual([2, 3]);
  });

  it("does not re-strike a string the pointer started on", () => {
    expect(stringsCrossed(120, 130, ys)).toEqual([]);
    expect(stringsCrossed(110, 120, ys)).toEqual([1]);
  });

  it("returns nothing without vertical movement", () => {
    expect(stringsCrossed(150, 150, ys)).toEqual([]);
  });

  it("works with strings listed in any order", () => {
    expect(stringsCrossed(0, 300, [200, 100, 150])).toEqual([1, 2, 0]);
  });
});

describe("stringAt", () => {
  it("finds the string under the pointer within tolerance", () => {
    expect(stringAt(123, ys, 6)).toBe(1);
    expect(stringAt(130, ys, 6)).toBeNull();
  });

  it("picks the closest string when tolerances overlap", () => {
    expect(stringAt(111, ys, 12)).toBe(1);
  });
});
