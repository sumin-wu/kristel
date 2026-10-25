// Pure thumb-to-finger pinch detection from hand landmarks (MediaPipe 21-point layout).
// Finger index 0 = index, 1 = middle, 2 = ring, 3 = pinky, which maps to fret column 0..3.

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export const FINGER_NAMES = ["Index", "Middle", "Ring", "Pinky"] as const;

const WRIST = 0;
const THUMB_TIP = 4;
const MIDDLE_MCP = 9;
const FINGER_TIPS = [8, 12, 16, 20];

export interface PinchOptions {
  /** Tip distance / hand size below which a pinch closes. */
  on?: number;
  /** Tip distance / hand size above which a pinch opens (hysteresis). */
  off?: number;
  /** Consecutive frames a new pinch must be seen before it counts. */
  enterFrames?: number;
  /** Consecutive frames a pinch must be open (or the hand lost) before it releases. */
  exitFrames?: number;
}

function dist(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Thumb-tip to each fingertip distance, normalized by hand size (wrist → middle knuckle). */
export function pinchRatios(hand: readonly Point3[]): number[] {
  const size = dist(hand[WRIST], hand[MIDDLE_MCP]) || 1;
  return FINGER_TIPS.map((tip) => dist(hand[THUMB_TIP], hand[tip]) / size);
}

/** Threshold below which a thumb-to-fingertip ratio counts as a pinch. */
export const PINCH_THRESHOLD = 0.25;

/** Fingers (0 = index … 3 = pinky) whose tip is within `threshold` of the thumb tip. */
export function pinchedFingers(hand: readonly Point3[], threshold = PINCH_THRESHOLD): number[] {
  return pinchRatios(hand).flatMap((r, f) => (r < threshold ? [f] : []));
}

export class PinchDetector {
  private readonly on: number;
  private readonly off: number;
  private readonly enterFrames: number;
  private readonly exitFrames: number;
  private active: number | null = null;
  private candidate: number | null = null;
  private candidateFrames = 0;
  private openFrames = 0;

  constructor({ on = 0.35, off = 0.5, enterFrames = 2, exitFrames = 3 }: PinchOptions = {}) {
    this.on = on;
    this.off = off;
    this.enterFrames = enterFrames;
    this.exitFrames = exitFrames;
  }

  get finger(): number | null {
    return this.active;
  }

  /** Feed one frame (null = no hand seen). Returns the pinched finger, or null. */
  update(hand: readonly Point3[] | null): number | null {
    const ratios = hand ? pinchRatios(hand) : null;

    if (this.active !== null) {
      if (!ratios || ratios[this.active] > this.off) {
        if (++this.openFrames >= this.exitFrames) this.reset();
      } else {
        this.openFrames = 0;
      }
      return this.active;
    }

    let best: number | null = null;
    if (ratios) {
      for (let f = 0; f < ratios.length; f++) {
        if (ratios[f] < this.on && (best === null || ratios[f] < ratios[best])) best = f;
      }
    }
    if (best === null || best !== this.candidate) {
      this.candidate = best;
      this.candidateFrames = best === null ? 0 : 1;
    } else {
      this.candidateFrames++;
    }
    if (this.candidate !== null && this.candidateFrames >= this.enterFrames) {
      this.active = this.candidate;
      this.openFrames = 0;
    }
    return this.active;
  }

  reset(): void {
    this.active = null;
    this.candidate = null;
    this.candidateFrames = 0;
    this.openFrames = 0;
  }
}
