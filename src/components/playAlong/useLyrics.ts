"use client";

// Lyrics state for the play-along: LRCLIB search, a speed-adjustable clock,
// and the chord-per-line track.

import { useEffect, useRef, useState } from "react";
import {
  chordAt,
  fillProgression,
  loadChordTrack,
  nextChange,
  parseProgression,
  saveChordTrack,
  songKey,
  type ChordTrack,
} from "@/lib/chordTrack";
import type { ChordName } from "@/lib/chords";
import { activeLineIndex, fetchLyrics, type Lyrics } from "@/lib/lyrics";

export const DEFAULT_ARTIST = "girl in red";
export const DEFAULT_TITLE = "we fell in love in october";
/** The progression you gave for this song; used to pre-fill its chord track. */
export const DEFAULT_PROGRESSION = "Cmaj7 Gmaj7 C G D";
export const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;

export type LyricsStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; lyrics: Lyrics }
  | { kind: "missing" }
  | { kind: "error"; message: string };

/** Line texts (synced or plain). */
export function lyricLines(lyrics: Lyrics): string[] {
  return lyrics.synced ? lyrics.synced.map((l) => l.text) : (lyrics.plain ?? []);
}

export function useLyrics() {
  const [artist, setArtist] = useState(DEFAULT_ARTIST);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [status, setStatus] = useState<LyricsStatus>({ kind: "idle" });
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(1);
  const elapsedRef = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const [track, setTrack] = useState<ChordTrack>({});
  const [trackAuto, setTrackAuto] = useState(false);
  const [progression, setProgression] = useState(DEFAULT_PROGRESSION);
  const trackKey = useRef("");

  /** Load this song's saved chords, or pre-fill the default song from its progression. */
  const loadTrack = (lyrics: Lyrics) => {
    const key = songKey(lyrics.artistName, lyrics.trackName);
    trackKey.current = key;
    const saved = loadChordTrack(key);
    if (saved) {
      setTrack(saved);
      setTrackAuto(false);
    } else if (key === songKey(DEFAULT_ARTIST, DEFAULT_TITLE)) {
      setTrack(fillProgression(lyricLines(lyrics), parseProgression(DEFAULT_PROGRESSION)));
      setTrackAuto(true);
    } else {
      setTrack({});
      setTrackAuto(false);
    }
  };

  const updateTrack = (next: ChordTrack) => {
    setTrack(next);
    setTrackAuto(false);
    saveChordTrack(trackKey.current, next);
  };

  const seek = (seconds: number) => {
    elapsedRef.current = Math.max(0, seconds);
    setElapsed(elapsedRef.current);
  };

  const search = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "loading" });
    setPlaying(false);
    seek(0);
    try {
      const lyrics = await fetchLyrics(artist, title, controller.signal);
      if (lyrics) loadTrack(lyrics);
      setStatus(lyrics ? { kind: "ready", lyrics } : { kind: "missing" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({
        kind: "error",
        message: err instanceof Error && err.message.startsWith("Lyrics") ? err.message : "Couldn't reach the lyrics service.",
      });
    }
  };

  const lyrics = status.kind === "ready" ? status.lyrics : null;
  const synced = lyrics?.synced ?? null;
  const duration = lyrics?.duration ?? null;

  // The clock: tick ~10×/s while playing (scaled by speed), stopping at the end of the song.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      elapsedRef.current += ((now - last) / 1000) * speed;
      last = now;
      setElapsed(elapsedRef.current);
      if (duration && elapsedRef.current > duration) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [playing, duration, speed]);

  useEffect(() => () => abort.current?.abort(), []);

  const lines = lyrics ? lyricLines(lyrics) : [];
  const active = synced ? activeLineIndex(synced, elapsed) : -1;
  // Before the first line, show the first chord coming up.
  const nowChord = active >= 0 ? chordAt(track, active) : (nextChange(track, -1, lines.length)?.chord ?? null);
  const upcoming = active >= 0 ? nextChange(track, active, lines.length) : null;

  return {
    artist,
    setArtist,
    title,
    setTitle,
    status,
    search,
    lyrics,
    synced,
    lines,
    playing,
    setPlaying,
    elapsed,
    seek,
    speed,
    setSpeed,
    active,
    current: active >= 0 ? synced![active].text : "",
    next: synced && active + 1 < synced.length ? synced[active + 1].text : "",
    track,
    trackAuto,
    progression,
    setProgression,
    fillLines: () => lyrics && updateTrack(fillProgression(lyricLines(lyrics), parseProgression(progression))),
    clearChords: () => updateTrack({}),
    setLineChord: (line: number, chord: ChordName | null) => {
      const next = { ...track };
      if (chord) next[line] = chord;
      else delete next[line];
      updateTrack(next);
    },
    nowChord,
    upcomingChord: upcoming?.chord ?? null,
  };
}

export type LyricsState = ReturnType<typeof useLyrics>;
