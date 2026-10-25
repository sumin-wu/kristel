"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  chordAt,
  fillProgression,
  fingeringFor,
  loadChordTrack,
  nextChange,
  parseProgression,
  saveChordTrack,
  songKey,
  type ChordTrack,
} from "@/lib/chordTrack";
import { CHORD_NAMES, type ChordName } from "@/lib/chords";
import { activeLineIndex, fetchLyrics, type Lyrics } from "@/lib/lyrics";
import { activeChordSet } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";

const DEFAULT_ARTIST = "girl in red";
const DEFAULT_TITLE = "we fell in love in october";
/** The progression you gave for this song; used to pre-fill its chord track. */
const DEFAULT_PROGRESSION = "Cmaj7 Gmaj7 C G D";

/** Line texts for chord filling (synced or plain). */
function lyricLines(lyrics: Lyrics): string[] {
  return lyrics.synced ? lyrics.synced.map((l) => l.text) : (lyrics.plain ?? []);
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; lyrics: Lyrics }
  | { kind: "missing" }
  | { kind: "error"; message: string };

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Lyrics from LRCLIB in a left-side drawer, with a play clock for synced
 * lyrics (strum along) and a karaoke strip on screen while it runs.
 */
interface LyricsPanelProps {
  open: boolean;
  onToggle: () => void;
}

const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;

export function LyricsPanel({ open, onToggle }: LyricsPanelProps) {
  /** Playback speed: slow the lyrics (and their chords) down to practice. */
  const [speed, setSpeed] = useState(1);
  const elapsedRef = useRef(0);
  const [artist, setArtist] = useState(DEFAULT_ARTIST);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
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

  const setLineChord = (line: number, chord: ChordName | null) => {
    const next = { ...track };
    if (chord) next[line] = chord;
    else delete next[line];
    updateTrack(next);
  };

  const search = async (a = artist, t = title) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "loading" });
    setPlaying(false);
    elapsedRef.current = 0;
    setElapsed(0);
    try {
      const lyrics = await fetchLyrics(a, t, controller.signal);
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

  const toggleOpen = () => {
    onToggle();
    if (status.kind === "idle") void search();
  };

  const duration = status.kind === "ready" ? status.lyrics.duration : null;

  // The play clock: tick ~10×/s while playing (scaled by speed), stopping at the end of the song.
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

  const lyrics = status.kind === "ready" ? status.lyrics : null;
  const synced = lyrics?.synced ?? null;
  const active = synced ? activeLineIndex(synced, elapsed) : -1;

  // Keep the active line in view in the drawer.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active, open]);

  const seek = (seconds: number) => {
    elapsedRef.current = Math.max(0, seconds);
    setElapsed(elapsedRef.current);
  };

  const play = () => setPlaying(true);
  const pause = () => setPlaying(false);

  const showStrip = !!synced && (playing || elapsed > 0);
  const current = active >= 0 ? synced![active].text : "";
  const next = synced && active + 1 < synced.length ? synced[active + 1].text : "";

  // Chords: the one in effect now (before the first line, the first one coming up) and the next change.
  const lineCount = lyrics ? lyricLines(lyrics).length : 0;
  const nowChord = active >= 0 ? chordAt(track, active) : (nextChange(track, -1, lineCount)?.chord ?? null);
  const upcoming = active >= 0 ? nextChange(track, active, lineCount) : null;
  const set = activeChordSet(settings);
  const fingering = nowChord ? fingeringFor(set, nowChord) : null;

  return (
    <>
      <button
        type="button"
        className={`lyrics-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="lyrics-drawer"
        onClick={toggleOpen}
      >
        {open ? "‹ Close" : "♪ Lyrics"}
      </button>

      {showStrip && (
        <div className="karaoke" aria-live="polite">
          {nowChord && (
            <div className="karaoke-chord">
              <span key={nowChord} className="karaoke-chord-name">
                {nowChord}
              </span>
              <span className="karaoke-chord-hint">
                {fingering ? `Thumb + ${fingering}` : set ? "not in this chord set" : "scale mode"}
                {upcoming && ` · next ${upcoming.chord}`}
              </span>
            </div>
          )}
          <p className="karaoke-current">{current || "♪"}</p>
          {next && <p className="karaoke-next">{next}</p>}
        </div>
      )}

      <aside id="lyrics-drawer" className={`lyrics${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
        <h2>Lyrics</h2>
        <form
          className="lyrics-search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input aria-label="Artist" placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <input aria-label="Song" placeholder="Song" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" disabled={status.kind === "loading" || !title.trim()}>
            {status.kind === "loading" ? "Searching…" : "Find lyrics"}
          </button>
        </form>

        {status.kind === "missing" && <p className="lyrics-note">No lyrics found. Check the spelling, or try just the song title.</p>}
        {status.kind === "error" && <p className="lyrics-note error">{status.message}</p>}

        {lyrics && (
          <>
            <p className="lyrics-track">
              <strong>{lyrics.trackName}</strong> · {lyrics.artistName}
              <span>{synced ? " · synced" : " · not synced"}</span>
            </p>

            {lyrics.instrumental && <p className="lyrics-note">This track is instrumental.</p>}

            {synced && (
              <div className="lyrics-controls">
                <button type="button" className="primary" onClick={playing ? pause : play}>
                  {playing ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Play"}
                </button>
                <button type="button" onClick={() => seek(0)} aria-label="Restart">
                  ⟲
                </button>
                <button type="button" onClick={() => seek(elapsed - 0.5)} aria-label="Lyrics half a second earlier">
                  −½s
                </button>
                <button type="button" onClick={() => seek(elapsed + 0.5)} aria-label="Lyrics half a second later">
                  +½s
                </button>
                <select
                  className="lyrics-speed"
                  aria-label="Playback speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {SPEEDS.map((x) => (
                    <option key={x} value={x}>
                      {Math.round(x * 100)}%
                    </option>
                  ))}
                </select>
                <span className="lyrics-time">
                  {formatTime(elapsed)}
                  {lyrics.duration ? ` / ${formatTime(lyrics.duration)}` : ""}
                </span>
              </div>
            )}

            <form
              className="chords-fill"
              onSubmit={(e) => {
                e.preventDefault();
                updateTrack(fillProgression(lyricLines(lyrics), parseProgression(progression)));
              }}
            >
              <input
                aria-label="Chord progression"
                placeholder="Progression, e.g. C G Am F"
                value={progression}
                onChange={(e) => setProgression(e.target.value)}
              />
              <button type="submit" disabled={!parseProgression(progression).length}>
                Fill lines
              </button>
              <button type="button" className="quiet" onClick={() => updateTrack({})}>
                Clear
              </button>
            </form>
            {trackAuto && (
              <p className="lyrics-note">
                Chords were filled from the progression, one per line. Change any line&apos;s chord to match the song.
              </p>
            )}

            <ol className="lyrics-lines" ref={listRef}>
              {lyricLines(lyrics).map((text, i) => (
                <li key={i} className={i === active ? "active" : i < active ? "past" : undefined}>
                  <select
                    className={`line-chord${track[i] ? "" : " empty"}`}
                    aria-label={`Chord for line ${i + 1}`}
                    value={track[i] ?? ""}
                    onChange={(e) => setLineChord(i, (e.target.value || null) as ChordName | null)}
                  >
                    <option value="">·</option>
                    {CHORD_NAMES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {synced ? (
                    <button type="button" onClick={() => seek(synced[i].time)}>
                      {text || "♪"}
                    </button>
                  ) : (
                    <span>{text || " "}</span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="lyrics-credit">
          Lyrics from <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. Press Play when the song starts;
          tap a line to jump there. Chords are saved per song in this browser.
        </p>
      </aside>
    </>
  );
}
