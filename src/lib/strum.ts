// Pure strum geometry: which horizontal strings a pointer crossed between two moves.

/**
 * Indices of strings (by their y positions) crossed moving from `fromY` to
 * `toY`, in the order they were crossed. A string exactly at `fromY` counts as
 * already struck, one exactly at `toY` counts as crossed.
 */
export function stringsCrossed(fromY: number, toY: number, ys: readonly number[]): number[] {
  if (fromY === toY) return [];
  const down = toY > fromY;
  const hit = ys
    .map((y, i) => ({ y, i }))
    .filter(({ y }) => (down ? y > fromY && y <= toY : y < fromY && y >= toY));
  hit.sort((a, b) => (down ? a.y - b.y : b.y - a.y));
  return hit.map(({ i }) => i);
}

/** The string within `tolerance` px of `y` (closest wins), or null. */
export function stringAt(y: number, ys: readonly number[], tolerance: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < ys.length; i++) {
    const d = Math.abs(ys[i] - y);
    if (d <= tolerance && (best === null || d < Math.abs(ys[best] - y))) best = i;
  }
  return best;
}
