// Imperative string vibration via the Web Animations API (no React re-render).

const FRAMES = 28;

export function vibrate(el: HTMLElement | null, amplitude = 3, duration = 1200): void {
  if (!el) return;
  const keyframes: Keyframe[] = [];
  for (let i = 0; i <= FRAMES; i++) {
    const decay = Math.exp((-4 * i) / FRAMES);
    const y = (i % 2 === 0 ? 1 : -1) * amplitude * decay;
    keyframes.push({
      transform: `translateY(${i === FRAMES ? 0 : y}px) scaleY(${1 + 1.5 * decay})`,
      filter: `blur(${(0.8 * decay).toFixed(2)}px)`,
    });
  }
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(keyframes, { duration, easing: "linear" });
}
