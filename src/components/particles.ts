// Fingertip particle trails drawn on a canvas. No React in here.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  hue: number;
  size: number;
}

const MAX_PARTICLES = 600;

/** Filter position 0..1 → hue: low cutoff glows ember orange, high cutoff icy cyan. */
export function filterHue(unit: number): number {
  return 18 + 172 * Math.min(1, Math.max(0, unit));
}

export class ParticleTrails {
  private particles: Particle[] = [];

  /** Emit a few particles at (x, y) in canvas pixels. */
  emit(x: number, y: number, hue: number, time: number, count = 1, scale = 1): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.02 + Math.random() * 0.05) * scale;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.03 * scale,
        born: time,
        life: 450 + Math.random() * 350,
        hue: hue + (Math.random() - 0.5) * 24,
        size: (1.5 + Math.random() * 2.5) * scale,
      });
    }
  }

  /** Advance and draw; `time` in ms. */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    this.particles = this.particles.filter((p) => time - p.born < p.life);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const age = time - p.born;
      const t = age / p.life;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = `hsl(${p.hue}, 95%, ${60 + 20 * (1 - t)}%)`;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (1 - 0.5 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear(): void {
    this.particles = [];
  }
}
