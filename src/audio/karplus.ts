// Pure Karplus-Strong plucked-string renderer. No Web Audio here so it can be unit tested.

export interface PluckOptions {
  /** 0..1, scales loudness and brightness. */
  velocity?: number;
  /** Seconds of audio to render. */
  duration?: number;
  /** Seconds for the note to fall by 60 dB. */
  t60?: number;
  /** Noise source, injectable for deterministic tests. */
  random?: () => number;
}

export interface SustainedPluck {
  data: Float32Array<ArrayBuffer>;
  /** Loop region in samples; spans a whole number of periods so the seam is click-free. */
  loopStart: number;
  loopEnd: number;
}

const TAIL_FADE = 0.05;

/**
 * Core string loop. `stretch` is the loop lowpass weight: 0.5 is the classic
 * 2-tap average; smaller values lose less high end per trip, so a held note
 * keeps some brightness.
 */
function renderString(
  freq: number,
  sampleRate: number,
  { velocity = 0.85, duration = 3.2, t60 = 3, random = Math.random }: PluckOptions,
  stretch: number,
  maxRho = 0.99999,
): { data: Float32Array<ArrayBuffer>; period: number } {
  const v = Math.min(1, Math.max(0, velocity));
  const out = new Float32Array(Math.round(duration * sampleRate));

  // Loop delay = N (buffer) + stretch (lowpass) + d (allpass), with d kept in [0.1, 1.1).
  const period = sampleRate / freq;
  const n = Math.max(2, Math.floor(period - stretch - 0.1));
  const d = period - stretch - n;
  const c = (1 - d) / (1 + d);

  // Loss per trip around the loop (freq trips per second) so the fundamental
  // hits -60 dB after t60; clamp for stability (DC sees rho directly).
  const w = (2 * Math.PI * freq) / sampleRate;
  const lowpassGain = Math.hypot(1 - stretch + stretch * Math.cos(w), stretch * Math.sin(w));
  const target = Math.pow(10, -3 / (t60 * freq));
  const rho = Math.min(maxRho, target / lowpassGain);

  // Excitation: noise, darker for softer plucks, DC removed, normalized to velocity.
  const buf = new Float32Array(n);
  const k = 0.25 + 0.75 * v;
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < n; i++) {
    lp += k * (random() * 2 - 1 - lp);
    buf[i] = lp;
    mean += lp;
  }
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    buf[i] -= mean;
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const gain = peak > 0 ? v / peak : 0;
  for (let i = 0; i < n; i++) buf[i] *= gain;

  let idx = 0;
  let prev = 0;
  let apX1 = 0;
  let apY1 = 0;
  for (let i = 0; i < out.length; i++) {
    const s = buf[idx];
    out[i] = s;
    const lowpassed = (1 - stretch) * s + stretch * prev;
    prev = s;
    const ap = c * lowpassed + apX1 - c * apY1;
    apX1 = lowpassed;
    apY1 = ap;
    buf[idx] = rho * ap;
    idx = idx + 1 === n ? 0 : idx + 1;
  }

  return { data: out, period };
}

/** A plucked note that rings out and decays (~3 s by default). */
export function renderPluck(freq: number, sampleRate: number, opts: PluckOptions = {}): Float32Array<ArrayBuffer> {
  const { data } = renderString(freq, sampleRate, opts, 0.5);
  const fade = Math.min(data.length, Math.round(TAIL_FADE * sampleRate));
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
  return data;
}

/**
 * A plucked note meant to be held: it settles into a near-steady tone and
 * exposes a loop region at the end, so playback can sustain indefinitely.
 */
export function renderSustain(
  freq: number,
  sampleRate: number,
  opts: Omit<PluckOptions, "t60"> = {},
): SustainedPluck {
  // rho may slightly exceed 1 to fully cancel the lowpass loss at the fundamental.
  // DC then grows by at most ~0.1% per trip, harmless over a finite 1.2 s render.
  const { data, period } = renderString(freq, sampleRate, { duration: 1.2, ...opts, t60: 600 }, 0.15, 1.01);

  // Pick a whole number of periods (~50–150 ms) whose length is closest to an
  // integer sample count, so the loop seam lines up with the waveform.
  const minK = Math.max(1, Math.ceil((0.05 * sampleRate) / period));
  const maxK = Math.max(minK, Math.floor((0.15 * sampleRate) / period));
  let bestLen = Math.round(minK * period);
  let bestErr = Infinity;
  for (let k = minK; k <= maxK; k++) {
    const len = k * period;
    const err = Math.abs(len - Math.round(len));
    if (err < bestErr) {
      bestErr = err;
      bestLen = Math.round(len);
    }
  }
  return { data, loopStart: data.length - bestLen, loopEnd: data.length };
}
