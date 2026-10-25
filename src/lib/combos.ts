// Pure finger-combo detection for the right hand: which set of fingers is
// touching the thumb, resolved into one "slot" per strum.
// Fingers: 0 = index, 1 = middle, 2 = ring, 3 = pinky. A slot is a bitmask of fingers.

import type { PinchFrame } from "./gesture";

export type SlotId = "I" | "M" | "R" | "P" | "IM" | "MR" | "RP" | "IR" | "IP" | "MP" | "IMR" | "MRP" | "IMRP";

const LETTERS = ["I", "M", "R", "P"] as const;
const NAMES = ["Index", "Middle", "Ring", "Pinky"] as const;

export function slotMask(id: SlotId): number {
  return [...id].reduce((mask, ch) => mask | (1 << LETTERS.indexOf(ch as (typeof LETTERS)[number])), 0);
}

export function slotFromMask(mask: number): SlotId | null {
  const id = LETTERS.filter((_, f) => mask & (1 << f)).join("");
  return (SLOTS as readonly { id: string }[]).some((s) => s.id === id) ? (id as SlotId) : null;
}

export function slotFingers(id: SlotId): number[] {
  return [...id].map((ch) => LETTERS.indexOf(ch as (typeof LETTERS)[number]));
}

/** Every combo the player can map a chord to, singles first. */
export const SLOTS: readonly { id: SlotId; label: string }[] = (
  ["I", "M", "R", "P", "IM", "MR", "RP", "IR", "IP", "MP", "IMR", "MRP", "IMRP"] as const
).map((id) => ({
  id,
  label: id.length === 4 ? "All four" : [...id].map((ch) => NAMES[LETTERS.indexOf(ch as (typeof LETTERS)[number])]).join(" + "),
}));

export interface ComboTrigger {
  slot: SlotId;
  /** 0..1, the fastest finger's closing speed. */
  velocity: number;
}

/**
 * Turns per-finger pinch starts into one trigger per combo. Fingers rarely
 * land on the same camera frame, so a new pinch waits up to `windowMs` for
 * others to join before firing; adding a finger to a held pinch fires the
 * bigger combo (e.g. hold index, add middle → "IM").
 */
export class ComboDetector {
  private pending: { mask: number; time: number; velocity: number } | null = null;

  constructor(private readonly windowMs = 70) {}

  update(frame: PinchFrame, time: number): ComboTrigger[] {
    const held = frame.pinched.reduce((mask, on, f) => (on ? mask | (1 << f) : mask), 0);
    const out: ComboTrigger[] = [];

    if (frame.started.length) {
      const velocity = Math.max(...frame.started.map((s) => s.velocity));
      if (this.pending) {
        this.pending.mask |= held;
        this.pending.velocity = Math.max(this.pending.velocity, velocity);
      } else {
        this.pending = { mask: held, time, velocity };
      }
    }

    if (this.pending) {
      const released = (this.pending.mask & held) !== this.pending.mask;
      if (released || time - this.pending.time >= this.windowMs) {
        const slot = slotFromMask(this.pending.mask);
        if (slot) out.push({ slot, velocity: this.pending.velocity });
        this.pending = null;
      }
    }
    return out;
  }
}

/** The scale-mode meaning of a slot: index–pinky = degrees 1–4, index + middle = 5. */
export function slotDegree(slot: SlotId): number | null {
  return ({ I: 1, M: 2, R: 3, P: 4, IM: 5 } as Partial<Record<SlotId, number>>)[slot] ?? null;
}
