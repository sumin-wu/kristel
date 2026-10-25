// Imperative string vibration via the Web Animations API (no React re-render).

const FRAMES = 28;

/**
 * Shake a string with a decaying wobble. With `hold`, it keeps a small steady
 * shimmer afterwards until `still()` is called (for sustained notes).
 */
export function vibrate(el: HTMLElement | null, amplitude = 3, { hold = false, duration = 1200 } = {}): void {
  if (!el) return;
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= FRAMES; i++) {
    const decay = hold ? 0.25 + 0.75 * Math.exp((-4 * i) / FRAMES) : Math.exp((-4 * i) / FRAMES);
    const y = (i % 2 === 0 ? 1 : -1) * amplitude * decay;
    keyframes.push({
      transform: `translateY(${!hold && i === FRAMES ? 0 : y}px) scaleY(${1 + 1.5 * decay})`,
      filter: `blur(${(0.8 * decay).toFixed(2)}px)`,
    });
  }
  still(el);
  el.animate(keyframes, { duration, easing: "linear" });
  if (hold) {
    const a = amplitude * 0.25;
    el.animate(
      [
        { transform: `translateY(${a}px) scaleY(1.4)`, filter: "blur(0.2px)" },
        { transform: `translateY(${-a}px) scaleY(1.4)`, filter: "blur(0.2px)" },
      ],
      { duration: 70, delay: duration, iterations: Infinity, direction: "alternate" },
    );
  }
}

export function still(el: HTMLElement | null): void {
  el?.getAnimations().forEach((a) => a.cancel());
}
