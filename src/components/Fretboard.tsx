import { noteName, type Tuning } from "@/lib/pitch";
import type { FretTarget } from "@/lib/touch";

const INLAYS = new Set([3, 5, 7, 9, 15]);

interface FretboardProps {
  tuning: Tuning;
  position: number;
  cols: number;
  held: FretTarget[];
  rowsRef: (el: HTMLDivElement | null) => void;
  stringRef: (string: number, el: HTMLDivElement | null) => void;
}

export function Fretboard({ tuning, position, cols, held, rowsRef, stringRef }: FretboardProps) {
  const strings = tuning.length;
  const heldSet = new Set(held.map((h) => `${h.string}:${h.col}`));
  const topCol = new Map<number, number>();
  for (const h of held) topCol.set(h.string, Math.max(topCol.get(h.string) ?? -1, h.col));
  const frets = Array.from({ length: cols }, (_, c) => position + c);

  return (
    <div className="fretboard">
      <div className="fretboard-rows" ref={rowsRef}>
        <div className="fretboard-frets" aria-hidden>
          {frets.map((fret, c) => (
            <div key={c} className={`fret-col${c === 0 && position === 1 ? " nut" : ""}`}>
              {fret === 12 ? (
                <>
                  <span className="inlay inlay-12a" />
                  <span className="inlay inlay-12b" />
                </>
              ) : (
                INLAYS.has(fret) && <span className="inlay" />
              )}
            </div>
          ))}
        </div>
        {Array.from({ length: strings }, (_, row) => {
          const s = strings - 1 - row;
          return (
            <div key={s} className="fret-row">
              <div
                className="string-line"
                style={{ "--gauge": `${1.2 + (strings - 1 - s) * 0.5}px` } as React.CSSProperties}
                data-wound={s < 3 || undefined}
                ref={(el) => stringRef(s, el)}
              />
              {frets.map((fret, c) => {
                const isHeld = heldSet.has(`${s}:${c}`);
                const isTop = topCol.get(s) === c;
                const midi = tuning[s] + fret;
                return (
                  <div
                    key={c}
                    className={`fret-cell${isHeld ? " held" : ""}${isTop ? " sounding" : ""}`}
                  >
                    <span className="note">
                      {noteName(midi, { octave: false })}
                      <sub>{Math.floor(midi / 12) - 1}</sub>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="fret-numbers">
        {frets.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
