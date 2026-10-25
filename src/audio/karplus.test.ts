import { describe, expect, it } from "vitest";
import { midiToHz } from "@/lib/pitch";
import { renderPluck, renderSustain } from "./karplus";

const FS = 48000;

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function rms(x: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
}

/** Autocorrelation pitch estimate searched near the expected frequency. */
function detectHz(x: Float32Array, expectedHz: number): number {
  const start = Math.round(0.2 * FS);
  const len = Math.round(0.3 * FS);
  const expectedLag = FS / expectedHz;
  const lo = Math.floor(expectedLag * 0.9);
  const hi = Math.ceil(expectedLag * 1.1);
  const ac = (lag: number) => {
    let s = 0;
    for (let i = start; i < start + len; i++) s += x[i] * x[i + lag];
    return s;
  };
  let best = lo;
  let bestVal = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > bestVal) {
      bestVal = v;
      best = lag;
    }
  }
  const [a, b, c] = [ac(best - 1), ac(best), ac(best + 1)];
  const offset = (0.5 * (a - c)) / (a - 2 * b + c);
  return FS / (best + offset);
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe("renderPluck", () => {
  it("renders the requested duration", () => {
    expect(renderPluck(110, FS, { duration: 3.2, random: seeded(1) })).toHaveLength(Math.round(3.2 * FS));
  });

  it("decays by at least 50 dB over ~3 s", () => {
    for (const midi of [40, 55, 79]) {
      const x = renderPluck(midiToHz(midi), FS, { random: seeded(2) });
      const first = rms(x, 0, FS / 10);
      const last = rms(x, x.length - FS / 10, x.length);
      expect(20 * Math.log10(last / first)).toBeLessThan(-50);
    }
  });

  it("still rings at 1 s (decay is not too fast)", () => {
    const x = renderPluck(midiToHz(45), FS, { random: seeded(3) });
    const first = rms(x, 0, FS / 10);
    const atOne = rms(x, FS, FS + FS / 10);
    expect(20 * Math.log10(atOne / first)).toBeGreaterThan(-35);
  });

  it.each([
    ["E2 (low E open)", 40],
    ["G4 (high E fret 3)", 67],
    ["G5 (high E fret 15)", 79],
  ])("%s is within 5 cents", (_, midi) => {
    const hz = midiToHz(midi);
    const x = renderPluck(hz, FS, { random: seeded(4) });
    expect(Math.abs(cents(detectHz(x, hz), hz))).toBeLessThan(5);
  });

  it("velocity scales the peak", () => {
    const peak = (x: Float32Array) => x.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
    const soft = renderPluck(196, FS, { velocity: 0.3, random: seeded(5) });
    const hard = renderPluck(196, FS, { velocity: 0.9, random: seeded(5) });
    expect(peak(hard)).toBeGreaterThan(peak(soft) * 2);
    expect(peak(hard)).toBeLessThan(1);
  });
});

describe("renderSustain", () => {
  it.each([
    ["E2", 40],
    ["G5", 79],
  ])("%s holds pitch within 5 cents", (_, midi) => {
    const hz = midiToHz(midi);
    const { data } = renderSustain(hz, FS, { random: seeded(6) });
    expect(Math.abs(cents(detectHz(data, hz), hz))).toBeLessThan(5);
  });

  it.each([40, 55, 79])("midi %i is loud and steady by the loop region", (midi) => {
    const { data, loopStart } = renderSustain(midiToHz(midi), FS, { random: seeded(7) });
    const len = data.length - loopStart;
    const early = rms(data, Math.round(0.3 * FS), Math.round(0.4 * FS));
    const before = rms(data, loopStart - len, loopStart);
    const loop = rms(data, loopStart, data.length);
    expect(20 * Math.log10(loop / early)).toBeGreaterThan(-10);
    // Repeating the loop must not audibly pump: adjacent windows within 0.5 dB.
    expect(Math.abs(20 * Math.log10(loop / before))).toBeLessThan(0.5);
  });

  it.each([40, 59, 79])("midi %i loops without a click at the seam", (midi) => {
    const { data, loopStart, loopEnd } = renderSustain(midiToHz(midi), FS, { random: seeded(8) });
    expect(loopEnd).toBe(data.length);
    expect(loopEnd - loopStart).toBeGreaterThan(0.04 * FS);
    let maxStep = 0;
    for (let i = loopStart + 1; i < loopEnd; i++) maxStep = Math.max(maxStep, Math.abs(data[i] - data[i - 1]));
    const seam = Math.abs(data[loopStart] - data[loopEnd - 1]);
    expect(seam).toBeLessThanOrEqual(maxStep * 1.1);
  });
});
