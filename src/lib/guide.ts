// Pure first-run guide: a list of steps, each finished by things the player does.

import type { ChordName } from "./chords";
import type { Settings } from "./settings";

export type GuideEvent =
  | { type: "hands"; left: boolean; right: boolean }
  | { type: "note"; degree: number; octave: number; midi: number }
  | { type: "glide" };

export interface SequenceNote {
  /** Pitch class to play, 0 = C … 11 = B. */
  pc: number;
  label: string;
  /** Chord strummed when this note is played correctly. */
  chord?: ChordName;
  /** How to play it with the step's settings. */
  hint: string;
}

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** Things to do in any order; the step ends when all are done. */
  targets: readonly string[];
  /** Which target (if any) this event completes. */
  match: (event: GuideEvent) => string | null;
  /** Or: notes to play in this exact order. */
  sequence?: readonly SequenceNote[];
  /** Settings the step switches to when it starts (e.g. the song's key). */
  settings?: Partial<Settings>;
}

const KEY_G = 7;

/** Chord roots of the opening of "we fell in love in october" (girl in red): Cmaj7 – Gmaj7 – C – G – D. */
export const SONG_CHORDS: readonly SequenceNote[] = [
  { pc: 0, label: "Cmaj7", chord: "Cmaj7", hint: "Pinky" },
  { pc: 7, label: "Gmaj7", chord: "Gmaj7", hint: "Index" },
  { pc: 0, label: "C", chord: "C", hint: "Pinky" },
  { pc: 7, label: "G", chord: "G", hint: "Index" },
  { pc: 2, label: "D", chord: "D", hint: "Index + middle" },
];

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "hands",
    title: "Show both hands",
    body: "Hold both hands up in front of the camera, palms facing it.",
    targets: ["Left hand", "Right hand"],
    match: () => null, // handled specially: both flags in one event
  },
  {
    id: "first-note",
    title: "Play your first note",
    body: "On your right hand, touch your thumb to your index finger.",
    targets: ["Index"],
    match: (e) => (e.type === "note" && e.degree === 1 ? "Index" : null),
  },
  {
    id: "scale",
    title: "Play up the scale",
    body: "Now touch your thumb to your middle, ring and pinky fingers — one at a time.",
    targets: ["Middle", "Ring", "Pinky"],
    match: (e) => (e.type === "note" ? (["Middle", "Ring", "Pinky"][e.degree - 2] ?? null) : null),
  },
  {
    id: "fifth",
    title: "Two fingers, fifth note",
    body: "Touch your thumb to your index and middle fingers together.",
    targets: ["Index + middle"],
    match: (e) => (e.type === "note" && e.degree === 5 ? "Index + middle" : null),
  },
  {
    id: "slide",
    title: "Slide to the next chord",
    body: "Pinch and hold, then slide your hand left or right — it strums the next chord along the scale.",
    targets: ["Slide"],
    match: (e) => (e.type === "glide" ? "Slide" : null),
  },
  {
    id: "octave",
    title: "Jump up an octave",
    body: "Keep your left thumb on your left index finger, then play any note with your right hand.",
    targets: ["Higher octave"],
    match: (e) => (e.type === "note" && e.octave >= 4 ? "Higher octave" : null),
  },
  {
    id: "song",
    title: "we fell in love in october",
    body: "The opening chords of girl in red's song. Pinch each chord's root and the guitar strums it. We've switched to G major for you. Left hand relaxed (no pinch).",
    targets: [],
    match: () => null,
    sequence: SONG_CHORDS,
    settings: { key: KEY_G, scale: "major" },
  },
];

export interface GuideState {
  step: number;
  done: readonly string[];
  /** The last note didn't match the next note of a sequence. */
  miss: boolean;
}

export const GUIDE_START: GuideState = { step: 0, done: [], miss: false };

export function isGuideFinished(state: GuideState, steps: readonly GuideStep[] = GUIDE_STEPS): boolean {
  return state.step >= steps.length;
}

const next = (state: GuideState): GuideState => ({ step: state.step + 1, done: [], miss: false });

/** Apply one event; moves to the next step once the current one is complete. */
export function advanceGuide(
  state: GuideState,
  event: GuideEvent,
  steps: readonly GuideStep[] = GUIDE_STEPS,
): GuideState {
  const step = steps[state.step];
  if (!step) return state;

  if (step.sequence) {
    if (event.type !== "note") return state;
    const want = step.sequence[state.done.length];
    if (((event.midi % 12) + 12) % 12 !== want.pc) return { ...state, miss: true };
    const done = [...state.done, want.label];
    return done.length === step.sequence.length ? next(state) : { ...state, done, miss: false };
  }

  const hits =
    step.id === "hands"
      ? event.type === "hands"
        ? [event.left && "Left hand", event.right && "Right hand"].filter((x): x is string => !!x)
        : []
      : [step.match(event)].filter((x): x is string => x !== null);
  const newHits = hits.filter((h) => !state.done.includes(h));
  if (!newHits.length) return state;

  const done = [...state.done, ...newHits];
  return step.targets.every((t) => done.includes(t)) ? next(state) : { ...state, done };
}
