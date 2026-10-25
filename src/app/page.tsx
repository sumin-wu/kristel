"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GuitarEngine } from "@/audio/engine";
import { Fretboard } from "@/components/Fretboard";
import { PluckStrips } from "@/components/PluckStrips";
import { TopBar } from "@/components/TopBar";
import { vibrate } from "@/components/vibrate";
import { STRING_COUNT, TUNINGS, pitchForString } from "@/lib/pitch";
import { TouchTracker, hitTest, type FretTarget, type TouchEvent } from "@/lib/touch";

const TUNING = TUNINGS.standard;
const COLS = 4;
const MIN_POSITION = 1;
const MAX_POSITION = 12;
const TAP_VELOCITY = 0.85;
const RING_MS = 3000;

type Els = (HTMLDivElement | null)[];

function strumVelocity(speedPxPerMs: number): number {
  return Math.min(1, Math.max(0.45, 0.5 + speedPxPerMs * 0.3));
}

export default function Home() {
  const [position, setPosition] = useState(MIN_POSITION);
  const [held, setHeld] = useState<FretTarget[]>([]);
  const [sounding, setSounding] = useState<(number | null)[]>(() => new Array(STRING_COUNT).fill(null));

  const engine = useRef<GuitarEngine | null>(null);
  const tracker = useRef(new TouchTracker());
  const positionRef = useRef(position);
  const boardRows = useRef<HTMLDivElement | null>(null);
  const stripRows = useRef<HTMLDivElement | null>(null);
  const boardStrings = useRef<Els>([]);
  const stripStrings = useRef<Els>([]);
  const strips = useRef<Els>([]);
  const lastMove = useRef(new Map<number, { x: number; y: number; t: number }>());
  const ringTimers = useRef<(ReturnType<typeof setTimeout> | undefined)[]>([]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const timers = ringTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      engine.current?.dispose();
    };
  }, []);

  const pitchFor = useCallback(
    (s: number, pos: number) =>
      pitchForString(TUNING, s, tracker.current.heldColumns(s).map((c) => pos + c)),
    [],
  );

  const pluck = useCallback(
    (s: number, velocity: number) => {
      const midi = pitchFor(s, positionRef.current);
      engine.current?.pluck(s, midi, velocity);
      const amp = 1.5 + velocity * 2.5;
      vibrate(boardStrings.current[s], amp * 0.6);
      vibrate(stripStrings.current[s], amp);
      strips.current[s]?.animate(
        [{ backgroundColor: "rgba(255, 200, 120, 0.22)" }, { backgroundColor: "rgba(255, 200, 120, 0)" }],
        { duration: 350, easing: "ease-out" },
      );
      setSounding((prev) => prev.map((m, i) => (i === s ? midi : m)));
      clearTimeout(ringTimers.current[s]);
      ringTimers.current[s] = setTimeout(
        () => setSounding((prev) => prev.map((m, i) => (i === s ? null : m))),
        RING_MS,
      );
    },
    [pitchFor],
  );

  const apply = useCallback(
    (events: TouchEvent[], velocity: number) => {
      for (const ev of events) {
        if (ev.type === "pluck") pluck(ev.string, ev.strum ? velocity : TAP_VELOCITY);
        else setHeld(tracker.current.heldCells());
      }
    },
    [pluck],
  );

  const targetAt = (x: number, y: number) => {
    const b = boardRows.current?.getBoundingClientRect();
    const s = stripRows.current?.getBoundingClientRect();
    if (!b || !s) return null;
    return hitTest(x, y, { board: b, strips: s, strings: STRING_COUNT, cols: COLS });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!engine.current) engine.current = new GuitarEngine(STRING_COUNT);
    engine.current.unlock();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastMove.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    apply(tracker.current.down(e.pointerId, targetAt(e.clientX, e.clientY)), TAP_VELOCITY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const last = lastMove.current.get(e.pointerId);
    if (!last) return;
    const dt = Math.max(1, e.timeStamp - last.t);
    const speed = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
    lastMove.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    apply(tracker.current.move(e.pointerId, targetAt(e.clientX, e.clientY)), strumVelocity(speed));
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    lastMove.current.delete(e.pointerId);
    const events = e.type === "pointercancel" ? tracker.current.cancel(e.pointerId) : tracker.current.up(e.pointerId);
    apply(events, TAP_VELOCITY);
  };

  const shift = (delta: number) =>
    setPosition((p) => Math.min(MAX_POSITION, Math.max(MIN_POSITION, p + delta)));

  // Derived from `held` so the strip labels re-render when holds change.
  const pitches = Array.from({ length: STRING_COUNT }, (_, s) =>
    pitchForString(
      TUNING,
      s,
      held.filter((h) => h.string === s).map((h) => position + h.col),
    ),
  );

  return (
    <main className="app" onContextMenu={(e) => e.preventDefault()}>
      <TopBar
        position={position}
        minPosition={MIN_POSITION}
        maxPosition={MAX_POSITION}
        cols={COLS}
        sounding={sounding}
        onShift={shift}
      />
      <div
        className="play-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <Fretboard
          tuning={TUNING}
          position={position}
          cols={COLS}
          held={held}
          rowsRef={(el) => {
            boardRows.current = el;
          }}
          stringRef={(s, el) => {
            boardStrings.current[s] = el;
          }}
        />
        <PluckStrips
          pitches={pitches}
          rowsRef={(el) => {
            stripRows.current = el;
          }}
          stringRef={(s, el) => {
            stripStrings.current[s] = el;
          }}
          stripRef={(s, el) => {
            strips.current[s] = el;
          }}
        />
      </div>
      <div className="rotate-overlay" role="alert">
        <div className="rotate-phone" aria-hidden />
        <p>Rotate to landscape</p>
      </div>
    </main>
  );
}
