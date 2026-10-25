// Pure chord-track logic: which chord goes with each lyric line, and helpers to
// fill, look up and finger them. Storage is a thin, guarded wrapper at the end.

import { isChordName, type ChordName } from "./chords";
import { SLOTS } from "./combos";
import type { ChordSet } from "./settings";

/** Chord per lyric line index; lines without one keep the previous chord. */
export type ChordTrack = Record<number, ChordName>;

export function songKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** "Cmaj7 Gmaj7, C - G D" → the valid chord names, in order. */
export function parseProgression(text: string): ChordName[] {
  return text
    .split(/[\s,|\-–—]+/)
    .map((t) => t.trim())
    .filter((t): t is ChordName => isChordName(t));
}

/** One chord per sung line, cycling through the progression; instrumental (empty) lines are skipped. */
export function fillProgression(lines: readonly string[], progression: readonly ChordName[]): ChordTrack {
  const track: ChordTrack = {};
  if (!progression.length) return track;
  let k = 0;
  lines.forEach((text, i) => {
    const sung = text.trim() !== "" && text.trim() !== "♪";
    if (sung) track[i] = progression[k++ % progression.length];
  });
  return track;
}

/** The chord in effect at line `index`: its own, or the last one set before it. */
export function chordAt(track: ChordTrack, index: number): ChordName | null {
  for (let i = index; i >= 0; i--) if (track[i]) return track[i];
  return null;
}

/** The next line after `index` where the chord changes, with that chord. */
export function nextChange(track: ChordTrack, index: number, lineCount: number): { line: number; chord: ChordName } | null {
  const current = chordAt(track, index);
  for (let i = index + 1; i < lineCount; i++) {
    if (track[i] && track[i] !== current) return { line: i, chord: track[i] };
  }
  return null;
}

/** How to play `chord` with the active set ("Index + Middle"), or null if the set doesn't have it. */
export function fingeringFor(set: ChordSet | null, chord: ChordName): string | null {
  if (!set) return null;
  const slot = SLOTS.find((s) => set.chords[s.id] === chord);
  return slot ? slot.label : null;
}

// ---- Storage (per song, in this browser) ----

const STORAGE_KEY = "gesture-synth.chord-tracks.v1";

function readAll(): Record<string, ChordTrack> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ChordTrack>) : {};
  } catch {
    return {};
  }
}

export function loadChordTrack(key: string): ChordTrack | null {
  const stored = readAll()[key];
  if (!stored || typeof stored !== "object") return null;
  const track: ChordTrack = {};
  for (const [i, c] of Object.entries(stored)) if (isChordName(c) && Number.isInteger(Number(i))) track[Number(i)] = c;
  return track;
}

export function saveChordTrack(key: string, track: ChordTrack): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [key]: track }));
  } catch {
    // Not saved this time; the chords still show for this session.
  }
}
