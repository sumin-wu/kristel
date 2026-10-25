// Pure pointer-tracking state: which pointer holds which fret cell or strip.
// String index 0 = low E ... 5 = high E. Rows are drawn high E on top.

export type FretTarget = { kind: "fret"; string: number; col: number };
export type StripTarget = { kind: "strip"; string: number };
export type Target = FretTarget | StripTarget;

export type TouchEvent =
  | { type: "pluck"; string: number; strum: boolean }
  | { type: "holdsChanged" };

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SurfaceLayout {
  /** Touch fretboard; omit when frets come from elsewhere (e.g. the camera). */
  board?: Rect;
  strips: Rect;
  strings: number;
  cols: number;
}

function inside(x: number, y: number, r: Rect): boolean {
  return x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
}

function rowToString(y: number, r: Rect, strings: number): number {
  const row = Math.min(strings - 1, Math.floor(((y - r.top) / r.height) * strings));
  return strings - 1 - row;
}

export function hitTest(x: number, y: number, layout: SurfaceLayout): Target | null {
  const { board, strips, strings, cols } = layout;
  if (board && inside(x, y, board)) {
    const col = Math.min(cols - 1, Math.floor(((x - board.left) / board.width) * cols));
    return { kind: "fret", string: rowToString(y, board, strings), col };
  }
  if (inside(x, y, strips)) {
    return { kind: "strip", string: rowToString(y, strips, strings) };
  }
  return null;
}

function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind || a.string !== b.string) return false;
  return a.kind === "strip" || a.col === (b as FretTarget).col;
}

export class TouchTracker {
  private pointers = new Map<number, Target>();

  down(id: number, target: Target | null): TouchEvent[] {
    if (!target) return [];
    this.pointers.set(id, target);
    return target.kind === "strip"
      ? [{ type: "pluck", string: target.string, strum: false }]
      : [{ type: "holdsChanged" }];
  }

  /**
   * A pointer stays in the zone it started in: a fretting finger that slides
   * off the board keeps its last cell, and a plucking finger that drifts onto
   * the board is ignored. Sliding across strips strums each new one.
   */
  move(id: number, target: Target | null): TouchEvent[] {
    const current = this.pointers.get(id);
    if (!current || !target || target.kind !== current.kind || sameTarget(current, target)) {
      return [];
    }
    this.pointers.set(id, target);
    return target.kind === "strip"
      ? [{ type: "pluck", string: target.string, strum: true }]
      : [{ type: "holdsChanged" }];
  }

  up(id: number): TouchEvent[] {
    const current = this.pointers.get(id);
    if (!current) return [];
    this.pointers.delete(id);
    return current.kind === "fret" ? [{ type: "holdsChanged" }] : [];
  }

  cancel(id: number): TouchEvent[] {
    return this.up(id);
  }

  heldColumns(string: number): number[] {
    const cols: number[] = [];
    for (const t of this.pointers.values()) {
      if (t.kind === "fret" && t.string === string) cols.push(t.col);
    }
    return cols;
  }

  heldCells(): FretTarget[] {
    const seen = new Set<string>();
    const cells: FretTarget[] = [];
    for (const t of this.pointers.values()) {
      if (t.kind !== "fret") continue;
      const key = `${t.string}:${t.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(t);
    }
    return cells;
  }
}
