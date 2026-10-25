"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GuitarEngine } from "@/audio/engine";
import { CameraPanel } from "@/components/CameraPanel";
import { PluckStrips } from "@/components/PluckStrips";
import { TopBar } from "@/components/TopBar";
import { still, vibrate } from "@/components/vibrate";
import { STRING_COUNT, TUNINGS, fretToMidi } from "@/lib/pitch";
import { TouchTracker, hitTest, type TouchEvent } from "@/lib/touch";

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

/** Pinched finger 0..3 frets column 0..3 of the window; no pinch = open string. */
function fretFor(pinch: number | null, position: number): number {
  return pinch === null ? 0 : position + pinch;
}

export default function Home() {
  const [position, setPosition] = useState(MIN_POSITION);
  const [pinch, setPinch] = useState<number | null>(null);
  const [sounding, setSounding] = useState<(number | null)[]>(() => new Array(STRING_COUNT).fill(null));

  const engine = useRef<GuitarEngine | null>(null);
  const tracker = useRef(new TouchTracker());
  const positionRef = useRef(position);
  const pinchRef = useRef<number | null>(null);
  const stripRows = useRef<HTMLDivElement | null>(null);
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

  const unlockAudio = useCallback(() => {
    if (!engine.current) engine.current = new GuitarEngine(STRING_COUNT);
    engine.current.unlock();
  }, []);

  const setSoundingNote = (s: number, midi: number | null) =>
    setSounding((prev) => prev.map((m, i) => (i === s ? midi : m)));

  const pluck = useCallback((s: number, velocity: number) => {
    const held = pinchRef.current;
    const midi = fretToMidi(TUNING, s, fretFor(held, positionRef.current));
    const sustain = held !== null;
    engine.current?.pluck(s, midi, { velocity, sustain });

    vibrate(stripStrings.current[s], 1.5 + velocity * 2.5, { hold: sustain });
    strips.current[s]?.animate(
      [{ backgroundColor: "rgba(255, 200, 120, 0.22)" }, { backgroundColor: "rgba(255, 200, 120, 0)" }],
      { duration: 350, easing: "ease-out" },
    );

    setSoundingNote(s, midi);
    clearTimeout(ringTimers.current[s]);
    if (!sustain) ringTimers.current[s] = setTimeout(() => setSoundingNote(s, null), RING_MS);
  }, []);

  const onPinchChange = useCallback((finger: number | null) => {
    if (pinchRef.current !== null && finger !== pinchRef.current) {
      for (const s of engine.current?.releaseSustained() ?? []) {
        still(stripStrings.current[s]);
        setSoundingNote(s, null);
      }
    }
    pinchRef.current = finger;
    setPinch(finger);
  }, []);

  const apply = (events: TouchEvent[], velocity: number) => {
    for (const ev of events) {
      if (ev.type === "pluck") pluck(ev.string, ev.strum ? velocity : TAP_VELOCITY);
    }
  };

  const targetAt = (x: number, y: number) => {
    const rect = stripRows.current?.getBoundingClientRect();
    return rect ? hitTest(x, y, { strips: rect, strings: STRING_COUNT, cols: COLS }) : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockAudio();
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
    if (e.type === "pointercancel") tracker.current.cancel(e.pointerId);
    else tracker.current.up(e.pointerId);
  };

  const shift = (delta: number) =>
    setPosition((p) => Math.min(MAX_POSITION, Math.max(MIN_POSITION, p + delta)));

  const pitches = Array.from({ length: STRING_COUNT }, (_, s) => fretToMidi(TUNING, s, fretFor(pinch, position)));

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
      <div className="stage">
        <CameraPanel position={position} onStart={unlockAudio} onPinchChange={onPinchChange} />
        <div
          className="play-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
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
      </div>
      <div className="rotate-overlay" role="alert">
        <div className="rotate-phone" aria-hidden />
        <p>Rotate to landscape</p>
      </div>
    </main>
  );
}
