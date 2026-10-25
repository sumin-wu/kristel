import { describe, expect, it } from "vitest";
import { TUNINGS, pitchForString } from "./pitch";
import { TouchTracker, hitTest, type SurfaceLayout } from "./touch";

const layout: SurfaceLayout = {
  board: { left: 0, top: 0, width: 600, height: 300 },
  strips: { left: 600, top: 0, width: 400, height: 300 },
  strings: 6,
  cols: 4,
};

const fret = (string: number, col: number) => ({ kind: "fret", string, col }) as const;
const strip = (string: number) => ({ kind: "strip", string }) as const;

describe("hitTest", () => {
  it("maps the top row to high E and the bottom row to low E", () => {
    expect(hitTest(10, 10, layout)).toEqual(fret(5, 0));
    expect(hitTest(590, 290, layout)).toEqual(fret(0, 3));
  });

  it("maps columns left to right", () => {
    expect(hitTest(160, 130, layout)).toEqual(fret(3, 1));
  });

  it("hits strips on the right", () => {
    expect(hitTest(800, 10, layout)).toEqual(strip(5));
    expect(hitTest(999, 299, layout)).toEqual(strip(0));
  });

  it("hits only strips when there is no touch fretboard", () => {
    const stripsOnly = { strips: layout.strips, strings: 6, cols: 4 };
    expect(hitTest(10, 10, stripsOnly)).toBeNull();
    expect(hitTest(800, 10, stripsOnly)).toEqual(strip(5));
  });

  it("returns null outside the surface", () => {
    expect(hitTest(1001, 10, layout)).toBeNull();
    expect(hitTest(10, 301, layout)).toBeNull();
  });
});

describe("TouchTracker", () => {
  it("holds frets on several strings with several pointers", () => {
    const t = new TouchTracker();
    expect(t.down(1, fret(0, 2))).toEqual([{ type: "holdsChanged" }]);
    t.down(2, fret(1, 1));
    t.down(3, fret(5, 2));
    expect(t.heldColumns(0)).toEqual([2]);
    expect(t.heldColumns(1)).toEqual([1]);
    expect(t.heldColumns(5)).toEqual([2]);
    expect(t.heldColumns(3)).toEqual([]);
    expect(t.heldCells()).toHaveLength(3);
  });

  it("highest fret wins, and release falls back to the lower one", () => {
    const t = new TouchTracker();
    const position = 1;
    const pitch = () =>
      pitchForString(TUNINGS.standard, 2, t.heldColumns(2).map((c) => position + c));
    t.down(1, fret(2, 1));
    t.down(2, fret(2, 3));
    expect(pitch()).toBe(50 + 4);
    t.up(2);
    expect(pitch()).toBe(50 + 2);
    t.up(1);
    expect(pitch()).toBe(50);
  });

  it("plucks a strip on pointerdown", () => {
    const t = new TouchTracker();
    expect(t.down(1, strip(4))).toEqual([{ type: "pluck", string: 4, strum: false }]);
  });

  it("strumming across 3 strips yields 3 plucks", () => {
    const t = new TouchTracker();
    const events = [...t.down(1, strip(5)), ...t.move(1, strip(4)), ...t.move(1, strip(3))];
    expect(events.filter((e) => e.type === "pluck").map((e) => e.type === "pluck" && e.string)).toEqual([5, 4, 3]);
  });

  it("moving within the same strip does not re-pluck", () => {
    const t = new TouchTracker();
    t.down(1, strip(2));
    expect(t.move(1, strip(2))).toEqual([]);
  });

  it("sliding a fretting finger moves the hold", () => {
    const t = new TouchTracker();
    t.down(1, fret(3, 0));
    expect(t.move(1, fret(3, 2))).toEqual([{ type: "holdsChanged" }]);
    expect(t.heldColumns(3)).toEqual([2]);
  });

  it("pointers stay in their starting zone", () => {
    const t = new TouchTracker();
    t.down(1, fret(3, 0));
    expect(t.move(1, strip(3))).toEqual([]);
    expect(t.move(1, null)).toEqual([]);
    expect(t.heldColumns(3)).toEqual([0]);
    t.down(2, strip(1));
    expect(t.move(2, fret(1, 3))).toEqual([]);
  });

  it("cancel clears the hold", () => {
    const t = new TouchTracker();
    t.down(1, fret(0, 1));
    expect(t.cancel(1)).toEqual([{ type: "holdsChanged" }]);
    expect(t.heldCells()).toEqual([]);
  });

  it("dedupes two fingers on the same cell", () => {
    const t = new TouchTracker();
    t.down(1, fret(0, 1));
    t.down(2, fret(0, 1));
    expect(t.heldCells()).toEqual([fret(0, 1)]);
  });

  it("ignores pointerdown outside the surface", () => {
    const t = new TouchTracker();
    expect(t.down(1, null)).toEqual([]);
    expect(t.up(1)).toEqual([]);
  });
});
