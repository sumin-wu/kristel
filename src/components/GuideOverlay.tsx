import { GUIDE_STEPS, isGuideFinished, type GuideState } from "@/lib/guide";

interface GuideOverlayProps {
  /** "intro" before the player chooses Start or Skip. */
  state: GuideState | "intro";
  onStart: () => void;
  onSkip: () => void;
  onReplay: () => void;
  onFinish: () => void;
}

export function GuideOverlay({ state, onStart, onSkip, onReplay, onFinish }: GuideOverlayProps) {
  if (state === "intro") {
    return (
      <div className="guide guide-intro" role="dialog" aria-labelledby="guide-title">
        <p className="guide-kicker">Quick guide</p>
        <h2 id="guide-title">Learn to play in about a minute</h2>
        <p className="guide-body">
          We&apos;ll walk through each gesture, then you&apos;ll play the opening of <em>we fell in love in october</em>{" "}
          by girl in red.
        </p>
        <div className="guide-actions">
          <button type="button" className="primary" onClick={onStart}>
            Start
          </button>
          <button type="button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (isGuideFinished(state)) {
    return (
      <div className="guide guide-done" role="dialog" aria-labelledby="guide-title">
        <p className="guide-kicker">Guide complete</p>
        <h2 id="guide-title">You played it 🎸</h2>
        <p className="guide-body">
          Cmaj7 · Gmaj7 · C · G · D — the opening of <em>we fell in love in october</em>.
        </p>
        <div className="guide-actions">
          <button type="button" className="primary" onClick={onFinish}>
            Start jamming
          </button>
          <button type="button" onClick={onReplay}>
            Play it back
          </button>
        </div>
      </div>
    );
  }

  const step = GUIDE_STEPS[state.step];
  const next = step.sequence?.[state.done.length];
  return (
    <div className="guide" role="status" aria-live="polite">
      <div className="guide-head">
        <p className="guide-kicker">
          Step {state.step + 1} of {GUIDE_STEPS.length}
        </p>
        <button type="button" className="guide-skip" onClick={onSkip}>
          Skip guide
        </button>
      </div>
      <h2>{step.title}</h2>
      <p className="guide-body">{step.body}</p>

      <div className="guide-chips">
        {step.sequence
          ? step.sequence.map((n, i) => (
              <span
                key={i}
                className={`guide-chip${i < state.done.length ? " done" : ""}${i === state.done.length ? " current" : ""}`}
              >
                <strong>{n.label}</strong>
                <small>{n.hint}</small>
              </span>
            ))
          : step.targets.map((t) => (
              <span key={t} className={`guide-chip${state.done.includes(t) ? " done" : ""}`}>
                <strong>{t}</strong>
              </span>
            ))}
      </div>

      {state.miss && next && (
        <p className="guide-miss">
          Not quite — next is <strong>{next.label}</strong> ({next.hint.toLowerCase()}).
        </p>
      )}
    </div>
  );
}
