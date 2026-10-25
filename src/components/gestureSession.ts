// Per-frame glue for the gesture synth: hands → notes/params → audio, canvas, HUD.
// Plain TypeScript (no React state per frame); React gets throttled summaries via callbacks.

import { getSynth } from "@/audio/toneEngine";
import { CALIBRATION_MS, OPEN_PHASE_MS, calibrateThresholds } from "@/lib/calibration";
import {
  FistDetector,
  MAX_REVERB_WET,
  Smoothed,
  angleDelta,
  distanceUnit,
  handOpenness,
  heightUnit,
  opennessUnit,
  resolveParams,
  rollAngle,
  rollUnit,
  type GestureValues,
  type SynthParams,
} from "@/lib/controls";
import {
  HysteresisPinch,
  LeadController,
  degreeToMidi,
  octaveFor,
  type NoteTrigger,
  type PinchFrame,
} from "@/lib/gesture";
import { ComboDetector, slotDegree, slotFingers } from "@/lib/combos";
import type { GuideEvent } from "@/lib/guide";
import { chordLabel, chordNotes, diatonicTriad, strumVoicing } from "@/lib/chords";
import { pinchRatios } from "@/lib/pinch";
import { noteName } from "@/lib/pitch";
import { activeChordSet, pinchThresholds, type PinchThresholds } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";
import { HAND_BONES, type HandFrame, type Handedness, type TrackedHand } from "@/vision/handTracker";
import { ParticleTrails, filterHue } from "./particles";

export const HAND_COLORS: Record<Handedness, string> = { Left: "#22e5ff", Right: "#ff3df2" };

const FINGER_TIPS = [8, 12, 16, 20];
const THUMB_TIP = 4;
const PALM = [0, 5, 9, 13, 17];
const FLASH_MS = 320;
const FLOAT_MS = 1400;
const STATS_INTERVAL_MS = 200;

export type CalibrationPhase = "open" | "pinch";

export interface HandSummary {
  handedness: Handedness;
  score: number;
  pinched: boolean[];
}

export interface SessionStats {
  fps: number;
  octave: number;
  /** Detection finished → sound out, ms (latest note, smoothed). */
  latencyMs: number | null;
  /** Camera capture → landmarks ready, ms. */
  inferenceMs: number;
  hands: HandSummary[];
}

export interface SessionCallbacks {
  /** A note or chord was played: its name, and octave for single notes (null for chords). */
  onNote: (name: string, octave: number | null) => void;
  /** Notes and glides as they're played (for the guide). */
  onPlay: (event: GuideEvent) => void;
  onStats: (stats: SessionStats) => void;
  onCalibrationPhase: (phase: CalibrationPhase | null, progress: number) => void;
  onCalibrated: (result: PinchThresholds | null) => void;
}

interface Flash {
  handedness: Handedness;
  finger: number;
  start: number;
}

/** A chord name drifting up from where it was played (canvas pixels). */
interface FloatingNote {
  text: string;
  x: number;
  y: number;
  start: number;
}

/** Draw text that reads correctly on the mirrored canvas. */
function mirroredText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function palmCenter(hand: TrackedHand): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const i of PALM) {
    x += hand.image[i].x;
    y += hand.image[i].y;
  }
  return { x: x / PALM.length, y: y / PALM.length };
}

export class GestureSession {
  private readonly pinches: Record<Handedness, HysteresisPinch> = {
    Left: new HysteresisPinch(),
    Right: new HysteresisPinch(),
  };
  private readonly combos = new ComboDetector();
  private readonly fists: Record<Handedness, FistDetector> = { Left: new FistDetector(), Right: new FistDetector() };
  private fistsClosed = false;
  private muteFlash = -Infinity;
  private readonly lead = new LeadController();
  private readonly particles = new ParticleTrails();
  private readonly smoothed = {
    height: new Smoothed(0.5),
    roll: new Smoothed(0),
    handDistance: new Smoothed(0.3),
    openness: new Smoothed(0.5),
    pinchX: new Smoothed(0.5),
  };
  private flashes: Flash[] = [];
  private floating: FloatingNote[] = [];
  private rollRef: number | null = null;
  private holding = false;
  private leadMuted = false;
  private glideSteps = 0;
  private params: SynthParams | null = null;

  private fps = 0;
  private lastFrame = 0;
  private lastStats = 0;
  private lastPinchKey = "";
  private latencyMs: number | null = null;
  private inferenceMs = 0;
  private octave = 3;

  private calibration: { start: number | null; open: number[]; pinch: number[]; phase: CalibrationPhase } | null =
    null;
  private meters: Map<string, { fill: HTMLElement; value: HTMLElement }> | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
    private readonly hud: () => HTMLElement | null,
    private readonly cb: SessionCallbacks,
  ) {}

  /** Stop pinches from strumming (e.g. while the guide strums the song's own chords). */
  setLeadMuted(muted: boolean): void {
    this.leadMuted = muted;
  }

  startCalibration(): void {
    this.release();
    this.calibration = { start: null, open: [], pinch: [], phase: "open" };
    this.cb.onCalibrationPhase("open", 0);
  }

  handle = (frame: HandFrame): void => {
    const { hands, time } = frame;
    const settings = settingsStore.get();
    const thresholds = pinchThresholds(settings);
    for (const p of Object.values(this.pinches)) p.setThresholds(thresholds.start, thresholds.release);

    if (this.lastFrame) {
      const instant = 1000 / (time - this.lastFrame);
      this.fps = this.fps ? this.fps * 0.9 + instant * 0.1 : instant;
    }
    this.lastFrame = time;
    this.inferenceMs = this.inferenceMs * 0.9 + (frame.detectedAt - frame.capturedAt) * 0.1;

    const left = hands.find((h) => h.handedness === "Left") ?? null;
    const right = hands.find((h) => h.handedness === "Right") ?? null;

    if (this.calibration) {
      this.calibrate(hands, time);
      this.render(frame, { Left: null, Right: null });
      return;
    }

    const frames: Record<Handedness, PinchFrame> = {
      Left: this.pinches.Left.update(left ? pinchRatios(left.world) : null, time),
      Right: this.pinches.Right.update(right ? pinchRatios(right.world) : null, time),
    };

    // Continuous gestures, smoothed so values don't jitter.
    const rightPalm = right ? palmCenter(right) : null;
    const leftPalm = left ? palmCenter(left) : null;
    const s = this.smoothed;
    s.height.update(rightPalm ? heightUnit(rightPalm.y) : null);
    s.pinchX.update(right ? 1 - right.image[THUMB_TIP].x : null); // mirrored: player's left → right
    s.openness.update(left ? opennessUnit(handOpenness(left.world)) : null);
    s.handDistance.update(
      rightPalm && leftPalm
        ? distanceUnit(Math.hypot((rightPalm.x - leftPalm.x) * frame.aspect, rightPalm.y - leftPalm.y) / frame.aspect)
        : null,
    );
    const roll = right ? rollAngle(right.image, frame.aspect) : null;

    // Both fists clenched: stop everything ringing (and play nothing while clenched).
    const leftFist = this.fists.Left.update(left ? handOpenness(left.world) : null);
    const rightFist = this.fists.Right.update(right ? handOpenness(right.world) : null);
    const bothFists = leftFist && rightFist;
    if (bothFists && !this.fistsClosed) {
      getSynth()?.muteAll();
      this.muteFlash = time;
    }
    this.fistsClosed = bothFists;

    this.octave = octaveFor(frames.Left.pinched);
    const combos = bothFists ? [] : this.combos.update(frames.Right, time);
    const set = activeChordSet(settings);
    const synth = getSynth();

    /** Float a chord name up from the fingertip(s) that played it. */
    const float = (text: string, fingers: readonly number[]) => {
      if (!right) return;
      const tips = fingers.length ? fingers.map((f) => FINGER_TIPS[f]) : [THUMB_TIP];
      const x = tips.reduce((sum, t) => sum + right.image[t].x, 0) / tips.length;
      const y = tips.reduce((sum, t) => sum + right.image[t].y, 0) / tips.length;
      this.floating.push({ text, x: x * this.canvas.width, y: y * this.canvas.height, start: time });
    };
    const noteLatency = () => {
      if (!synth) return;
      const latency = performance.now() - frame.detectedAt + synth.outputLatencyMs();
      this.latencyMs = this.latencyMs === null ? latency : this.latencyMs * 0.7 + latency * 0.3;
    };
    const flash = (fingers: readonly number[]) => {
      for (const f of fingers) this.flashes.push({ handedness: "Right", finger: f, start: time });
    };

    if (set) {
      // Chord-set mode: each finger combo strums the Telecaster chord assigned to it.
      for (const combo of combos) {
        const chord = set.chords[combo.slot];
        if (!chord) continue;
        const fingers = slotFingers(combo.slot);
        const notes = chordNotes(chord).map((m) => m + 12 * (this.octave - 3));
        this.rollRef = roll;
        s.roll.value = 0;
        if (!this.leadMuted) synth?.strum(notes, combo.velocity, 0.06 - 0.03 * combo.velocity);
        noteLatency();
        this.cb.onNote(chord, null);
        float(chord, fingers);
        flash(fingers);
        this.cb.onPlay({ type: "note", degree: slotDegree(combo.slot) ?? 0, octave: this.octave, midi: notes[0] });
      }
      this.holding = frames.Right.pinched.some(Boolean);
      this.glideSteps = 0;
      if (!this.holding) this.rollRef = null;
    } else {
      // Scale mode: index–pinky and index + middle are scale degrees; a held pinch slides.
      const triggers: NoteTrigger[] = combos.flatMap((c) => {
        const degree = slotDegree(c.slot);
        return degree ? [{ degree, velocity: c.velocity, fingers: slotFingers(c.slot) }] : [];
      });
      const { actions, state } = this.lead.update({
        triggers,
        pinched: frames.Right.pinched,
        x: right ? s.pinchX.value : null,
        octave: this.octave,
        scale: settings.scale,
        key: settings.key,
      });
      /** Strum the scale chord on this note; faster pinches strum tighter and louder. */
      const strum = (midi: number, velocity: number) => {
        const pc = midi % 12;
        const voicing = strumVoicing(pc, diatonicTriad(pc, settings.scale, settings.key), this.octave - 3);
        synth?.strum(voicing, velocity, 0.06 - 0.03 * velocity);
      };
      const label = (midi: number) => chordLabel(midi % 12, diatonicTriad(midi % 12, settings.scale, settings.key));
      for (const action of actions) {
        if (action.type === "on") {
          this.rollRef = roll;
          s.roll.value = 0;
          if (!this.leadMuted) strum(action.midi, action.velocity); // else the guide plays its own chords
          noteLatency();
          this.announce(action.midi);
          const fingers = triggers.at(-1)?.fingers ?? [];
          float(label(action.midi), fingers);
          flash(fingers);
          this.cb.onPlay({ type: "note", degree: triggers.at(-1)?.degree ?? 1, octave: this.octave, midi: action.midi });
        } else if (action.type === "glide") {
          if (!this.leadMuted) strum(action.midi, 0.6);
          this.announce(action.midi);
          float(label(action.midi), []);
          this.cb.onPlay({ type: "glide" });
        } else {
          // Strummed chords ring out on their own, like letting go of a real guitar.
          this.rollRef = null;
        }
      }
      this.holding = state.holding;
      this.glideSteps = state.steps;
    }
    s.roll.update(this.holding && roll !== null && this.rollRef !== null ? rollUnit(angleDelta(roll, this.rollRef)) : 0);

    const values: GestureValues = {
      height: s.height.value,
      roll: s.roll.value,
      handDistance: s.handDistance.value,
      openness: s.openness.value,
    };
    this.params = resolveParams(values, settings.mapping, settings.bendRange);
    if (synth) {
      synth.setPreset(settings.preset);
      synth.setParams(this.params);
    }

    this.render(frame, { Left: frames.Left.pinched, Right: frames.Right.pinched });
    this.updateHud();
    this.report(hands, frames, time);
  };

  /** Release any held note (e.g. when stopping or calibrating). */
  release(): void {
    this.holding = false;
    this.lead.update({ triggers: [], pinched: [false, false, false, false], x: null, octave: 3, scale: "minorPentatonic", key: 4 });
  }

  private announce(midi: number): void {
    this.cb.onNote(noteName(midi, { octave: false }), Math.floor(midi / 12) - 1);
  }

  private calibrate(hands: TrackedHand[], time: number): void {
    const c = this.calibration!;
    c.start ??= time;
    const elapsed = time - c.start;
    const phase: CalibrationPhase = elapsed < OPEN_PHASE_MS ? "open" : "pinch";
    if (phase !== c.phase) c.phase = phase;
    this.cb.onCalibrationPhase(phase, Math.min(1, elapsed / CALIBRATION_MS));

    if (hands.length) {
      const min = Math.min(...hands.flatMap((h) => pinchRatios(h.world)));
      (phase === "open" ? c.open : c.pinch).push(min);
    }
    if (elapsed >= CALIBRATION_MS) {
      this.calibration = null;
      this.cb.onCalibrationPhase(null, 1);
      this.cb.onCalibrated(calibrateThresholds(c.open, c.pinch));
    }
  }

  private render(frame: HandFrame, pinched: Record<Handedness, readonly boolean[] | null>): void {
    const { canvas, video } = this;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const { width: w, height: h } = canvas;
    const time = frame.time;
    ctx.clearRect(0, 0, w, h);
    const settings = settingsStore.get();
    const r = Math.max(4, w / 220);

    // Faint line between the hands that brightens with reverb.
    const left = frame.hands.find((x) => x.handedness === "Left");
    const right = frame.hands.find((x) => x.handedness === "Right");
    if (left && right) {
      const a = palmCenter(left);
      const b = palmCenter(right);
      const wet = (this.params?.reverbWet ?? 0) / MAX_REVERB_WET;
      const grad = ctx.createLinearGradient(a.x * w, a.y * h, b.x * w, b.y * h);
      grad.addColorStop(0, HAND_COLORS.Left);
      grad.addColorStop(1, HAND_COLORS.Right);
      ctx.save();
      ctx.globalAlpha = 0.08 + 0.72 * wet;
      ctx.strokeStyle = grad;
      ctx.lineWidth = r * (0.4 + 1.2 * wet);
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 24 * wet;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
      ctx.restore();
    }

    // Particle trails colored by the current filter position.
    const cutoffUnit = this.params ? Math.log(this.params.cutoff / 200) / Math.log(40) : 0.5;
    const hue = filterHue(cutoffUnit);
    for (const hand of frame.hands) {
      for (const tip of [THUMB_TIP, ...FINGER_TIPS]) {
        this.particles.emit(hand.image[tip].x * w, hand.image[tip].y * h, hue, time, 1, w / 1280);
      }
    }
    this.particles.draw(ctx, time);

    for (const hand of frame.hands) {
      const color = HAND_COLORS[hand.handedness];
      const at = (i: number) => [hand.image[i].x * w, hand.image[i].y * h] as const;

      if (settings.showDebug) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, w / 400);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        for (const [a, b] of HAND_BONES) {
          ctx.moveTo(...at(a));
          ctx.lineTo(...at(b));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        for (let i = 0; i < hand.image.length; i++) {
          const [x, y] = at(i);
          ctx.beginPath();
          ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Held pinches: a bright bar from thumb tip to each pinched fingertip.
      const [tx, ty] = at(THUMB_TIP);
      pinched[hand.handedness]?.forEach((on, f) => {
        if (!on) return;
        const [fx, fy] = at(FINGER_TIPS[f]);
        ctx.save();
        ctx.strokeStyle = "#fff";
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = r * 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.restore();
      });

      // Note flashes: a white burst and expanding ring on the fingertip that played.
      for (const flash of this.flashes) {
        if (flash.handedness !== hand.handedness) continue;
        const t = (time - flash.start) / FLASH_MS;
        if (t < 0 || t > 1) continue;
        const [fx, fy] = at(FINGER_TIPS[flash.finger]);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(fx, fy, r * (2.2 - t), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 0.8;
        ctx.beginPath();
        ctx.arc(fx, fy, r * (2 + 6 * t), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    this.flashes = this.flashes.filter((f) => time - f.start < FLASH_MS);

    if (right) this.drawFingerLabels(ctx, right, pinched.Right, settings, r);
    this.drawFloating(ctx, time, w);
    this.drawMuteFlash(ctx, time, w, h);
  }

  /** "STOP" stamped in the middle for a moment after both fists mute the strings. */
  private drawMuteFlash(ctx: CanvasRenderingContext2D, time: number, w: number, h: number): void {
    const t = (time - this.muteFlash) / 700;
    if (t < 0 || t > 1) return;
    const size = Math.max(40, w / 11) * (1.15 - 0.15 * Math.min(1, t * 4));
    ctx.save();
    ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(w / 2, h / 2);
    ctx.scale(-1, 1);
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.strokeText("STOP", 0, 0);
    ctx.fillStyle = "#ff2d4b";
    ctx.fillText("STOP", 0, 0);
    ctx.restore();
  }

  /** Small chord names above each right-hand fingertip: what that pinch will play. */
  private drawFingerLabels(
    ctx: CanvasRenderingContext2D,
    hand: TrackedHand,
    pinched: readonly boolean[] | null,
    settings: ReturnType<typeof settingsStore.get>,
    r: number,
  ): void {
    const { width: w, height: h } = this.canvas;
    const size = Math.max(12, w / 70);
    ctx.save();
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const set = activeChordSet(settings);
    FINGER_TIPS.forEach((tip, f) => {
      let text: string;
      if (set) {
        text = set.chords[(["I", "M", "R", "P"] as const)[f]] ?? "–";
      } else {
        const pc = degreeToMidi(f + 1, this.octave, settings.scale, settings.key) % 12;
        text = chordLabel(pc, diatonicTriad(pc, settings.scale, settings.key));
      }
      const x = hand.image[tip].x * w;
      const y = hand.image[tip].y * h - r * 4.5;
      const on = !!pinched?.[f];
      const bw = ctx.measureText(text).width + size * 0.9;
      const bh = size * 1.5;
      ctx.globalAlpha = on ? 1 : 0.8;
      ctx.fillStyle = on ? "#fff" : "rgba(7, 8, 10, 0.72)";
      roundedRect(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = on ? HAND_COLORS.Right : "#fff";
      mirroredText(ctx, text, x, y + 1);
    });
    ctx.restore();
  }

  /** Chord names drifting up and fading out from where they were played. */
  private drawFloating(ctx: CanvasRenderingContext2D, time: number, w: number): void {
    this.floating = this.floating.filter((n) => time - n.start < FLOAT_MS);
    const size = Math.max(28, w / 22);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const n of this.floating) {
      const t = (time - n.start) / FLOAT_MS;
      const ease = 1 - (1 - t) * (1 - t);
      const scale = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - 0.2 * Math.min(1, (t - 0.12) / 0.3);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `800 ${size * scale}px system-ui, sans-serif`;
      ctx.lineWidth = size * 0.12;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.shadowColor = HAND_COLORS.Right;
      ctx.shadowBlur = 24;
      const x = n.x + Math.sin(t * Math.PI * 2) * size * 0.15;
      const y = n.y - size * 0.8 - ease * size * 4;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.strokeText(n.text, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  private updateHud(): void {
    const root = this.hud();
    const p = this.params;
    if (!root || !p) return;
    if (!this.meters || !root.contains(this.meters.values().next().value?.fill ?? null)) {
      this.meters = new Map();
      root.querySelectorAll<HTMLElement>("[data-meter]").forEach((el) => {
        const fill = el.querySelector<HTMLElement>(".meter-fill");
        const value = el.querySelector<HTMLElement>(".meter-value");
        if (fill && value) this.meters!.set(el.dataset.meter!, { fill, value });
      });
    }
    const settings = settingsStore.get();
    const set = (name: string, from: number, to: number, text: string) => {
      const m = this.meters!.get(name);
      if (!m) return;
      m.fill.style.left = `${Math.min(from, to) * 100}%`;
      m.fill.style.width = `${Math.abs(to - from) * 100}%`;
      m.value.textContent = text;
    };
    const uni = (name: string, v: number, text: string) => set(name, 0, Math.min(1, Math.max(0, v)), text);
    const bi = (name: string, v: number, text: string) => set(name, 0.5, 0.5 + Math.max(-1, Math.min(1, v)) / 2, text);

    const cutoffUnit = Math.log(p.cutoff / 200) / Math.log(40);
    uni("filter", cutoffUnit, p.cutoff >= 1000 ? `${(p.cutoff / 1000).toFixed(1)}k` : `${Math.round(p.cutoff)}`);
    bi("bend", p.bend / Math.max(0.5, settings.bendRange), `${p.bend >= 0 ? "+" : ""}${p.bend.toFixed(1)}`);
    bi("glide", this.glideSteps / 5, `${this.glideSteps > 0 ? "+" : ""}${this.glideSteps}`);
    uni("sustain", this.holding ? 1 : 0, this.holding ? "hold" : "—");
    uni("reverb", p.reverbWet / MAX_REVERB_WET, `${Math.round(p.reverbWet * 100)}%`);
    uni("distortion", p.distortion, `${Math.round(p.distortion * 100)}%`);
    uni("vibrato", p.vibrato, `${Math.round(p.vibrato * 100)}%`);
  }

  private report(hands: TrackedHand[], frames: Record<Handedness, PinchFrame>, time: number): void {
    const summary = hands.map((h) => ({ handedness: h.handedness, score: h.score, pinched: frames[h.handedness].pinched }));
    const key = summary.map((h) => `${h.handedness}:${h.pinched.join(",")}`).join("|");
    if (key === this.lastPinchKey && time - this.lastStats < STATS_INTERVAL_MS) return;
    this.lastPinchKey = key;
    this.lastStats = time;
    this.cb.onStats({
      fps: this.fps,
      octave: this.octave,
      latencyMs: this.latencyMs,
      inferenceMs: this.inferenceMs,
      hands: summary,
    });
  }
}
