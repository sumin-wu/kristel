"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { audioState, preloadTone, startAudio, subscribeAudioState } from "@/audio/toneEngine";
import { consumeCameraRequest } from "@/lib/cameraIntent";
import { chordNotes } from "@/lib/chords";
import {
  GUIDE_START,
  GUIDE_STEPS,
  SONG_CHORDS,
  advanceGuide,
  isGuideFinished,
  type GuideEvent,
  type GuideState,
} from "@/lib/guide";
import { FINGER_NAMES } from "@/lib/pinch";
import { SCALE_SET, type Settings } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";
import { CameraError, startHandTracking, type Handedness } from "@/vision/handTracker";
import { GestureSession, HAND_COLORS, type CalibrationPhase, type SessionStats } from "./gestureSession";
import { GuideOverlay } from "./GuideOverlay";
import { ChordPlayer } from "./ChordPlayer";
import { LyricsPanel } from "./LyricsPanel";
import { SettingsDrawer } from "./SettingsDrawer";

type Status = { kind: "idle" } | { kind: "starting" } | { kind: "running" } | { kind: "error"; message: string };

const METERS = [
  { id: "filter", label: "Filter", unit: "Hz", bipolar: false },
  { id: "bend", label: "Bend", unit: "st", bipolar: true },
  { id: "glide", label: "Glide", unit: "steps", bipolar: true },
  { id: "sustain", label: "Sustain", unit: "", bipolar: false },
  { id: "reverb", label: "Reverb", unit: "", bipolar: false },
  { id: "distortion", label: "Drive", unit: "", bipolar: false },
  { id: "vibrato", label: "Vibrato", unit: "", bipolar: false },
] as const;

const EMPTY_STATS: SessionStats = { fps: 0, octave: 3, latencyMs: null, inferenceMs: 0, hands: [] };

export function GestureView() {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  const sound = useSyncExternalStore(subscribeAudioState, audioState, () => "unloaded" as const);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<GestureSession | null>(null);
  const startingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [note, setNote] = useState<{ name: string; octave: number | null; key: number } | null>(null);
  /** The chord set the player had before the guide switched to scale mode. */
  const setBeforeGuide = useRef<string | null>(null);
  const [calibration, setCalibration] = useState<{ phase: CalibrationPhase; progress: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Left-side panel: only one of lyrics / chords open at a time. */
  const [leftPanel, setLeftPanel] = useState<"lyrics" | "chords" | null>(null);
  const toggleLeft = (panel: "lyrics" | "chords") => setLeftPanel((p) => (p === panel ? null : panel));
  const [guide, setGuide] = useState<GuideState | null>(null);
  const guideRef = useRef<GuideState | null>(null);

  const setGuideState = (g: GuideState | null) => {
    guideRef.current = g;
    setGuide(g);
    // During the song step, the guide strums the song's real chord shapes instead.
    const inSong = !!g && GUIDE_STEPS[g.step]?.sequence !== undefined;
    sessionRef.current?.setLeadMuted(inSong);
  };

  /** Feed something the player did into the guide (if it's running). */
  const feedGuide = (event: GuideEvent) => {
    const g = guideRef.current;
    if (!g || isGuideFinished(g)) return;
    const n = advanceGuide(g, event);
    if (n === g) return;
    const played = GUIDE_STEPS[g.step]?.sequence?.[g.done.length];
    if (played?.chord && !n.miss && (n.step !== g.step || n.done.length > g.done.length)) {
      startAudio()?.strum(chordNotes(played.chord));
    }
    if (n.step !== g.step) {
      const patch = GUIDE_STEPS[n.step]?.settings;
      if (patch) settingsStore.update(patch);
    }
    setGuideState(n);
  };

  const closeGuide = () => {
    settingsStore.update({ guideSeen: true, ...(setBeforeGuide.current ? { activeSet: setBeforeGuide.current } : {}) });
    setBeforeGuide.current = null;
    setGuideState(null);
  };

  /** The guide teaches scale degrees, so it runs in scale mode and restores your set after. */
  const startGuide = () => {
    setBeforeGuide.current = settingsStore.get().activeSet;
    settingsStore.update({ activeSet: SCALE_SET });
    setGuideState(GUIDE_START);
  };

  const replaySong = () => {
    const synth = startAudio();
    SONG_CHORDS.forEach((c, i) => c.chord && synth?.strum(chordNotes(c.chord), 0.8, undefined, i * 1.6));
  };

  const showToast = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const start = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || startingRef.current) return;
    startingRef.current = true;
    setStatus({ kind: "starting" });

    let noteKey = 0;
    const session = new GestureSession(canvas, video, () => hudRef.current, {
      onNote: (name, octave) => setNote({ name, octave, key: ++noteKey }),
      onPlay: feedGuide,
      onStats: (s) => {
        setStats(s);
        feedGuide({
          type: "hands",
          left: s.hands.some((h) => h.handedness === "Left"),
          right: s.hands.some((h) => h.handedness === "Right"),
        });
      },
      onCalibrationPhase: (phase, progress) => {
        // Only re-render on phase changes and in ~10% progress steps.
        setCalibration((prev) => {
          if (phase === null) return null;
          const p = Math.floor(progress * 10) / 10;
          return prev && prev.phase === phase && prev.progress === p ? prev : { phase, progress: p };
        });
      },
      onCalibrated: (result) => {
        if (result) {
          settingsStore.update({ calibration: result });
          showToast("Calibrated to your hands");
        } else {
          showToast("Couldn't calibrate — using default thresholds. Try again from Settings.");
        }
      },
    });
    sessionRef.current = session;

    try {
      stopRef.current = await startHandTracking(video, session.handle, { numHands: 2 });
      setStatus({ kind: "running" });
      if (!settingsStore.get().calibration) session.startCalibration();
    } catch (err) {
      startingRef.current = false;
      sessionRef.current = null;
      setStatus({
        kind: "error",
        message: err instanceof CameraError ? err.message : "Couldn't start hand tracking.",
      });
    }
  };

  const onStartClick = () => {
    startAudio(); // inside the click, so audio unlocks on iOS/Safari
    void start();
  };

  // Arriving from the landing strum: open the camera straight away.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    void preloadTone();
    if (consumeCameraRequest()) void startRef.current();
    return () => {
      sessionRef.current?.release();
      stopRef.current?.();
      clearTimeout(toastTimer.current);
    };
  }, []);

  const update = (patch: Partial<Settings>) => settingsStore.update(patch);
  const byHand = (side: Handedness) => stats.hands.find((h) => h.handedness === side);
  const running = status.kind === "running";

  return (
    // Any click on the page also unlocks audio, in case it was skipped on the way here.
    <main className="gesture" onPointerDown={() => startAudio()} onContextMenu={(e) => e.preventDefault()}>
      <video ref={videoRef} className="gesture-video" playsInline muted />
      <canvas ref={canvasRef} className="gesture-overlay" />

      {running && settings.showDebug && (
        <aside className="gesture-debug" aria-live="polite">
          <div className="gesture-debug-row">
            <span>FPS</span>
            <strong>{stats.fps.toFixed(0)}</strong>
          </div>
          <div className="gesture-debug-row">
            <span>Detect → sound</span>
            <strong>{stats.latencyMs === null ? "—" : `${Math.round(stats.latencyMs)} ms`}</strong>
          </div>
          <div className="gesture-debug-row">
            <span>Camera → detect</span>
            <strong>{Math.round(stats.inferenceMs)} ms</strong>
          </div>
          <div className="gesture-debug-row">
            <span>Audio</span>
            <strong>{sound}</strong>
          </div>
          <div className="gesture-debug-row">
            <span>Octave</span>
            <strong>{stats.octave}</strong>
          </div>
          {(["Left", "Right"] as const).map((side) => {
            const hand = byHand(side);
            return (
              <div key={side} className="gesture-debug-hand" style={{ color: HAND_COLORS[side] }}>
                <div className="gesture-debug-row">
                  <span>
                    {side} hand · {side === "Left" ? "octave" : "notes"}
                  </span>
                  <strong>{hand ? `${Math.round(hand.score * 100)}%` : "—"}</strong>
                </div>
                <div className="gesture-fingers">
                  {FINGER_NAMES.map((name, f) => (
                    <span key={name} className={hand?.pinched[f] ? "on" : undefined}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </aside>
      )}

      {running && !settings.showDebug && stats.latencyMs !== null && (
        <div className="gesture-latency">{Math.round(stats.latencyMs)} ms</div>
      )}

      {running && (
        <>
          <div className="gesture-note" aria-live="polite">
            {note ? (
              <span key={note.key} className="gesture-note-name">
                {note.name}
                {note.octave !== null && <sub>{note.octave}</sub>}
              </span>
            ) : (
              !calibration && <span className="gesture-note-hint">Pinch with your right hand</span>
            )}
          </div>

          <div className="hud" ref={hudRef}>
            {METERS.map((m) => (
              <div key={m.id} className={`meter${m.bipolar ? " bipolar" : ""}`} data-meter={m.id}>
                <div className="meter-head">
                  <span>{m.label}</span>
                  <span className="meter-value">—</span>
                </div>
                <div className="meter-track">
                  <div className="meter-fill" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {calibration && (
        <div className="calibration" role="status">
          <p className="calibration-step">
            {calibration.phase === "open" ? "Open both hands" : "Now pinch thumb to index"}
          </p>
          <p className="calibration-sub">Calibrating your pinch · {Math.ceil(3 - calibration.progress * 3)}s</p>
          <div className="calibration-bar">
            <div style={{ width: `${calibration.progress * 100}%` }} />
          </div>
        </div>
      )}

      {toast && <div className="gesture-toast">{toast}</div>}

      {running && !calibration && !settings.guideSeen && (
        <GuideOverlay
          state={guide ?? "intro"}
          onStart={startGuide}
          onSkip={() => {
            sessionRef.current?.setLeadMuted(false);
            closeGuide();
          }}
          onReplay={replaySong}
          onFinish={closeGuide}
        />
      )}

      {running && sound !== "running" && (
        <button type="button" className="sound-off" onClick={() => startAudio()}>
          🔇 Sound is off — click to turn it on
        </button>
      )}

      {!running && (
        <div className="gesture-cover">
          <h1>Gesture synth</h1>
          <p className="gesture-sub">Right hand strums chords · left hand picks the octave · both fists stop</p>
          {status.kind === "error" && <p className="gesture-error">{status.message}</p>}
          <button type="button" onClick={onStartClick} disabled={status.kind === "starting"}>
            {status.kind === "starting" ? "Starting…" : status.kind === "error" ? "Try again" : "Start camera"}
          </button>
        </div>
      )}

      {running && (
        <>
          <LyricsPanel open={leftPanel === "lyrics"} onToggle={() => toggleLeft("lyrics")} />
          <ChordPlayer open={leftPanel === "chords"} onToggle={() => toggleLeft("chords")} />
        </>
      )}

      <SettingsDrawer
        open={drawerOpen}
        settings={settings}
        onToggle={() => setDrawerOpen((o) => !o)}
        onChange={update}
        onRecalibrate={() => {
          setDrawerOpen(false);
          sessionRef.current?.startCalibration();
        }}
        onReset={() => settingsStore.reset()}
        onShowGuide={() => {
          setDrawerOpen(false);
          setGuideState(null);
          settingsStore.update({ guideSeen: false });
        }}
        canCalibrate={running && !calibration}
      />
    </main>
  );
}
