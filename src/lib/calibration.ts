// Pure per-user pinch calibration: "open hands, then pinch".

import type { PinchThresholds } from "./settings";

export const CALIBRATION_MS = 3000;
/** First half: open hands. Second half: pinch. */
export const OPEN_PHASE_MS = 1500;

const MIN_SAMPLES = 8;
const MIN_GAP = 0.25;

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Each sample is one frame's smallest thumb-to-fingertip ratio (any finger, any
 * hand). Thresholds sit between the user's own pinched and open levels.
 * Returns null if the two phases weren't clearly different.
 */
export function calibrateThresholds(
  openSamples: readonly number[],
  pinchSamples: readonly number[],
): PinchThresholds | null {
  if (openSamples.length < MIN_SAMPLES || pinchSamples.length < MIN_SAMPLES) return null;
  const open = quantile(openSamples, 0.5);
  // People start pinching a beat late, so use the tighter end of the pinch phase.
  const pinched = quantile(pinchSamples, 0.2);
  const gap = open - pinched;
  if (gap < MIN_GAP) return null;
  const start = Math.min(0.5, Math.max(0.12, pinched + 0.25 * gap));
  const release = Math.max(start + 0.05, pinched + 0.4 * gap);
  return { start, release };
}
