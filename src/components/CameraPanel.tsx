"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { FINGER_NAMES, PinchDetector } from "@/lib/pinch";
import { CameraError, HAND_BONES, startHandTracking, type HandFrame } from "@/vision/handTracker";

const THUMB_TIP = 4;
const FINGER_TIPS = [8, 12, 16, 20];

type Status = { kind: "idle" } | { kind: "starting" } | { kind: "running" } | { kind: "error"; message: string };

interface CameraPanelProps {
  position: number;
  /** Called synchronously from the Start tap, so audio can unlock in the gesture. */
  onStart: () => void;
  /** Called when the pinched finger changes (0 = index … 3 = pinky, null = none). */
  onPinchChange: (finger: number | null) => void;
}

function draw(canvas: HTMLCanvasElement, hand: NormalizedLandmark[] | null, pinched: number | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (!hand) return;
  const at = (i: number) => [hand[i].x * w, hand[i].y * h] as const;

  ctx.lineWidth = Math.max(2, w / 240);
  ctx.strokeStyle = "rgba(243, 230, 212, 0.45)";
  ctx.beginPath();
  for (const [a, b] of HAND_BONES) {
    ctx.moveTo(...at(a));
    ctx.lineTo(...at(b));
  }
  ctx.stroke();

  const r = Math.max(5, w / 90);
  FINGER_TIPS.forEach((tip, f) => {
    const [x, y] = at(tip);
    ctx.beginPath();
    ctx.arc(x, y, f === pinched ? r * 1.6 : r, 0, Math.PI * 2);
    ctx.fillStyle = f === pinched ? "rgb(255, 186, 92)" : "rgba(243, 230, 212, 0.8)";
    ctx.fill();
  });
  const [tx, ty] = at(THUMB_TIP);
  ctx.beginPath();
  ctx.arc(tx, ty, r * 1.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgb(140, 200, 255)";
  ctx.fill();

  if (pinched !== null) {
    const [fx, fy] = at(FINGER_TIPS[pinched]);
    ctx.save();
    ctx.shadowColor = "rgb(255, 186, 92)";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "rgb(255, 210, 140)";
    ctx.lineWidth = r;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.restore();
  }
}

export function CameraPanel({ position, onStart, onPinchChange }: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onPinchRef = useRef(onPinchChange);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pinched, setPinched] = useState<number | null>(null);
  const [handSeen, setHandSeen] = useState(false);

  useEffect(() => {
    onPinchRef.current = onPinchChange;
  }, [onPinchChange]);

  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    onStart();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || status.kind === "starting" || status.kind === "running") return;
    setStatus({ kind: "starting" });

    const detector = new PinchDetector();
    let lastFinger: number | null = null;
    let lastSeen = false;
    const onFrame = ({ hands }: HandFrame) => {
      const image = hands[0]?.image ?? null;
      const finger = detector.update(hands[0]?.world ?? null);
      if (finger !== lastFinger) {
        lastFinger = finger;
        setPinched(finger);
        onPinchRef.current(finger);
      }
      if (!!image !== lastSeen) {
        lastSeen = !!image;
        setHandSeen(lastSeen);
      }
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      draw(canvas, image, finger);
    };

    try {
      stopRef.current = await startHandTracking(video, onFrame);
      setStatus({ kind: "running" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof CameraError ? err.message : "Couldn't start hand tracking.",
      });
    }
  };

  return (
    <section className="camera-panel">
      <div className="camera-view">
        <video ref={videoRef} className="camera-video" playsInline muted />
        <canvas ref={canvasRef} className="camera-overlay" />
        {status.kind !== "running" && (
          <div className="camera-cover">
            {status.kind === "error" && <p className="camera-error">{status.message}</p>}
            <button type="button" className="camera-start" onClick={start} disabled={status.kind === "starting"}>
              {status.kind === "starting" ? "Starting camera…" : status.kind === "error" ? "Try again" : "Start camera"}
            </button>
            <p className="camera-hint">Touch your thumb to a fingertip to choose a fret.</p>
          </div>
        )}
        {status.kind === "running" && !handSeen && <p className="camera-nohand">Show your fretting hand</p>}
      </div>
      <div className="finger-legend">
        {FINGER_NAMES.map((name, f) => (
          <div key={name} className={`finger-chip${f === pinched ? " active" : ""}`}>
            <span className="finger-name">{name}</span>
            <span className="finger-fret">fret {position + f}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
