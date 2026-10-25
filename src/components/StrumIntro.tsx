"use client";

import { useEffect, useRef, useState } from "react";
import { Bangers } from "next/font/google";
import { useRouter } from "next/navigation";
import { STRUM_SPACING, preloadTone, startAudio } from "@/audio/toneEngine";
import { requestCameraOnArrival } from "@/lib/cameraIntent";
import { chordNotes } from "@/lib/chords";
import { noteName } from "@/lib/pitch";
import { stringAt, stringsCrossed } from "@/lib/strum";
import { SpiderScene } from "./SpiderScene";
import { vibrate } from "./vibrate";

const comic = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-comic" });

const TITLE = "Happy Birthday KDAWG!";
const SUBTITLE = "BIG 23 UNC!!!";

/** Split into words of letters so each letter can pop in on its own (words never break mid-line). */
function PopLetters({ text, startMs, stepMs }: { text: string; startMs: number; stepMs: number }) {
  let i = 0;
  return (
    <>
      {text.split(" ").map((word, w) => (
        <span key={w} className="pop-word">
          {[...word].map((ch) => (
            <span key={i} className="pop-letter" style={{ animationDelay: `${startMs + i++ * stepMs}ms` }}>
              {ch}
            </span>
          ))}
          {w < text.split(" ").length - 1 && " "}
        </span>
      ))}
    </>
  );
}

// Open E minor chord (022000), low E drawn on top as when looking down at the guitar.
const CHORD = chordNotes("Em");
const HIT_TOLERANCE_PX = 12;
const LEAVE_DELAY_MS = 1400;

function strumVelocity(speedPxPerMs: number): number {
  return Math.min(1, Math.max(0.4, 0.45 + speedPxPerMs * 0.25));
}

export function StrumIntro() {
  const router = useRouter();
  const strings = useRef<(HTMLDivElement | null)[]>([]);
  const ys = useRef<number[]>([]);
  const last = useRef(new Map<number, { y: number; t: number }>());
  const plucked = useRef(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    void preloadTone();
    router.prefetch("/home");
  }, [router]);

  // Next keeps this page alive (hidden) after navigating away; reset it so
  // coming Back shows the strings again instead of the faded-out screen.
  useEffect(
    () => () => {
      plucked.current = 0;
      setLeaving(false);
    },
    [],
  );

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      requestCameraOnArrival();
      router.push("/home");
    }, LEAVE_DELAY_MS);
  };

  /** Strum every string top to bottom (for a click that missed, or the Start button). */
  const strumAll = (velocity = 0.8) => {
    CHORD.forEach((_, s) => setTimeout(() => pluck(s, velocity), s * STRUM_SPACING * 1000));
  };

  const pluck = (s: number, velocity: number) => {
    startAudio()?.playString(CHORD[s], velocity, 0, s);
    vibrate(strings.current[s], 2 + velocity * 4, { duration: 1600 });
    plucked.current++;
  };

  const measure = () => {
    ys.current = strings.current.map((el) => {
      const r = el?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : -1;
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    startAudio(); // unlock audio inside the gesture
    e.currentTarget.setPointerCapture(e.pointerId);
    measure();
    last.current.set(e.pointerId, { y: e.clientY, t: e.timeStamp });
    const s = stringAt(e.clientY, ys.current, HIT_TOLERANCE_PX);
    if (s !== null) pluck(s, 0.7);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = last.current.get(e.pointerId);
    if (!prev || leaving) return;
    const speed = Math.abs(e.clientY - prev.y) / Math.max(1, e.timeStamp - prev.t);
    for (const s of stringsCrossed(prev.y, e.clientY, ys.current)) pluck(s, strumVelocity(speed));
    last.current.set(e.pointerId, { y: e.clientY, t: e.timeStamp });
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    last.current.delete(e.pointerId);
    if (leaving || e.type === "pointercancel") return;
    // A plain click/tap that crossed no string still counts: strum the whole chord.
    if (plucked.current === 0) strumAll();
    leave();
  };

  return (
    <main
      className={`intro ${comic.variable}${leaving ? " leaving" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <SpiderScene />

      <header className="intro-title">
        <h1 aria-label={TITLE}>
          <PopLetters text={TITLE} startMs={350} stepMs={45} />
        </h1>
        <p className="intro-big23" aria-label={SUBTITLE}>
          {SUBTITLE}
        </p>
        <p className="intro-status">{leaving ? "Opening camera…" : "Strum the strings to begin"}</p>
      </header>

      <div className="intro-strings">
        {CHORD.map((midi, s) => (
          <div key={s} className="intro-row">
            <span className="intro-label">{noteName(midi, { octave: false })}</span>
            <div
              className="string-line"
              style={{ "--gauge": `${4.2 - s * 0.55}px` } as React.CSSProperties}
              data-wound={s < 3 || undefined}
              ref={(el) => {
                strings.current[s] = el;
              }}
            />
          </div>
        ))}
      </div>

      <div className="intro-footer">
        <p className="intro-hint">Click and drag across the strings — or just click</p>
        <button
          type="button"
          className="intro-start"
          disabled={leaving}
          // Keep the button's own press out of the page's strum handlers.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => {
            startAudio();
            strumAll();
            leave();
          }}
        >
          Start
        </button>
      </div>
    </main>
  );
}
