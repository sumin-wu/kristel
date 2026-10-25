import { noteName } from "@/lib/pitch";

interface TopBarProps {
  position: number;
  minPosition: number;
  maxPosition: number;
  cols: number;
  /** Sounding note per string (index 0 = low E), null when silent. */
  sounding: (number | null)[];
  onShift: (delta: number) => void;
}

export function TopBar({ position, minPosition, maxPosition, cols, sounding, onShift }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="position">
        <button
          type="button"
          aria-label="Shift window toward the nut"
          disabled={position <= minPosition}
          onClick={() => onShift(-1)}
        >
          ◀
        </button>
        <span className="position-label">
          Frets {position}–{position + cols - 1}
        </span>
        <button
          type="button"
          aria-label="Shift window toward the body"
          disabled={position >= maxPosition}
          onClick={() => onShift(1)}
        >
          ▶
        </button>
      </div>
      <div className="readout" aria-live="polite">
        {sounding.map((m, s) => (
          <span key={s} className={m === null ? "silent" : undefined}>
            {m === null ? "·" : noteName(m)}
          </span>
        ))}
      </div>
      <div className="brand">FretSynth</div>
    </header>
  );
}
