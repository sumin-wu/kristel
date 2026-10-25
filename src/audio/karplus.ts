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

const TAIL_FADE = 0.05;

export function renderPluck(freq: number, sampleRate: number, opts: PluckOptions = {}): Float32Array<ArrayBuffer> {
  const { velocity = 0.85, duration = 3.2, t60 = 3, random = Math.random } = opts;
  const v = Math.min(1, Math.max(0, velocity));
  const out = new Float32Array(Math.round(duration * sampleRate));

  // Loop delay = N (buffer) + 0.5 (averaging filter) + d (allpass), with d kept in [0.1, 1.1).
  const period = sampleRate / freq;
  const n = Math.max(2, Math.floor(period - 0.6));
  const d = period - 0.5 - n;
  const c = (1 - d) / (1 + d);

  // Loss per trip around the loop (freq trips per second) so the fundamental
  // hits -60 dB after t60; clamp for stability.
  const target = Math.pow(10, -3 / (t60 * freq));
  const rho = Math.min(0.99999, target / Math.cos((Math.PI * freq) / sampleRate));

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
    const avg = 0.5 * (s + prev);
    prev = s;
    const ap = c * avg + apX1 - c * apY1;
    apX1 = avg;
    apY1 = ap;
    buf[idx] = rho * ap;
    idx = idx + 1 === n ? 0 : idx + 1;
  }

  const fade = Math.min(out.length, Math.round(TAIL_FADE * sampleRate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;

  return out;
}
