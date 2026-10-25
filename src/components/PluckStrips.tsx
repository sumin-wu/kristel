import { noteName } from "@/lib/pitch";

interface PluckStripsProps {
  /** Pitch each string will play if plucked now, index 0 = low E. */
  pitches: number[];
  rowsRef: (el: HTMLDivElement | null) => void;
  stringRef: (string: number, el: HTMLDivElement | null) => void;
  stripRef: (string: number, el: HTMLDivElement | null) => void;
}

export function PluckStrips({ pitches, rowsRef, stringRef, stripRef }: PluckStripsProps) {
  const strings = pitches.length;
  return (
    <div className="strips">
      <div className="strip-rows" ref={rowsRef}>
        {Array.from({ length: strings }, (_, row) => {
          const s = strings - 1 - row;
          return (
            <div key={s} className="strip" ref={(el) => stripRef(s, el)}>
              <span className="strip-note">{noteName(pitches[s])}</span>
              <div
                className="string-line strip-string"
                style={{ "--gauge": `${2 + (strings - 1 - s) * 0.7}px` } as React.CSSProperties}
                data-wound={s < 3 || undefined}
                ref={(el) => stringRef(s, el)}
              />
            </div>
          );
        })}
      </div>
      <div className="fret-numbers" aria-hidden>
        <span>pluck · strum</span>
      </div>
    </div>
  );
}
