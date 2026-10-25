// Decorative comic-book spider scene for the landing page: corner webs that draw
// themselves in, and a spider dropping on its thread. Original artwork, purely visual.

/** A quarter-circle web anchored at (0, 0), spreading toward +x/+y. */
function webPath(radius: number, spokes = 7, rings = 6): string {
  const angles = Array.from({ length: spokes }, (_, i) => (i / (spokes - 1)) * (Math.PI / 2));
  const point = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
  let d = "";
  // Spokes out from the corner.
  for (const a of angles) {
    const [x, y] = point(radius, a);
    d += `M0 0L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  // Rings that sag toward the corner between spokes, like a real web.
  for (let k = 1; k <= rings; k++) {
    const r = (radius * k) / (rings + 0.4);
    angles.forEach((a, i) => {
      const [x, y] = point(r, a);
      if (i === 0) {
        d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
        return;
      }
      const mid = (a + angles[i - 1]) / 2;
      const [cx, cy] = point(r * 0.86, mid);
      d += `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
  }
  return d;
}

const WEB = webPath(300);

function Web({ className }: { className: string }) {
  return (
    <svg className={`spider-web ${className}`} viewBox="0 0 300 300" aria-hidden>
      <path d={WEB} pathLength={1} />
    </svg>
  );
}

function HangingSpider() {
  return (
    <div className="spider-drop" aria-hidden>
      <div className="spider-thread" />
      <svg className="spider" viewBox="-30 -24 60 52">
        <g className="spider-legs">
          {[-1, 1].map((side) =>
            [-14, -5, 5, 14].map((y, i) => (
              <path
                key={`${side}${i}`}
                d={`M${side * 5} ${y * 0.45} Q${side * 16} ${y - 8} ${side * 26} ${y + 6}`}
              />
            )),
          )}
        </g>
        <ellipse cx="0" cy="6" rx="8" ry="11" />
        <circle cx="0" cy="-9" r="6" />
        <ellipse className="spider-eye" cx="-2.4" cy="-10" rx="1.6" ry="2.2" />
        <ellipse className="spider-eye" cx="2.4" cy="-10" rx="1.6" ry="2.2" />
      </svg>
    </div>
  );
}

export function SpiderScene() {
  return (
    <div className="spider-scene" aria-hidden>
      <Web className="web-top-left" />
      <Web className="web-bottom-right" />
      <HangingSpider />
    </div>
  );
}
