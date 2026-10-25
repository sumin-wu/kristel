"use client";

import { useEffect, useRef, useState } from "react";
import { activeLineIndex, fetchLyrics, type Lyrics } from "@/lib/lyrics";

const DEFAULT_ARTIST = "girl in red";
const DEFAULT_TITLE = "we fell in love in october";

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
export function LyricsPanel() {
  const [open, setOpen] = useState(false);
  const [artist, setArtist] = useState(DEFAULT_ARTIST);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0); // performance.now() minus elapsed, while playing
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const search = async (a = artist, t = title) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: "loading" });
    setPlaying(false);
    setElapsed(0);
    try {
      const lyrics = await fetchLyrics(a, t, controller.signal);
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
    setOpen((o) => !o);
    if (status.kind === "idle") void search();
  };

  const duration = status.kind === "ready" ? status.lyrics.duration : null;

  // The play clock: tick ~10×/s while playing, stopping at the end of the song.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const t = (performance.now() - startedAt.current) / 1000;
      setElapsed(t);
      if (duration && t > duration) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [playing, duration]);

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
    const s = Math.max(0, seconds);
    setElapsed(s);
    startedAt.current = performance.now() - s * 1000;
  };

  const play = () => {
    startedAt.current = performance.now() - elapsed * 1000;
    setPlaying(true);
  };

  const pause = () => {
    setElapsed((performance.now() - startedAt.current) / 1000);
    setPlaying(false);
  };

  const showStrip = !!synced && (playing || elapsed > 0);
  const current = active >= 0 ? synced![active].text : "";
  const next = synced && active + 1 < synced.length ? synced[active + 1].text : "";

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
                <span className="lyrics-time">
                  {formatTime(elapsed)}
                  {lyrics.duration ? ` / ${formatTime(lyrics.duration)}` : ""}
                </span>
              </div>
            )}

            <ol className="lyrics-lines" ref={listRef}>
              {synced
                ? synced.map((line, i) => (
                    <li key={i} className={i === active ? "active" : i < active ? "past" : undefined}>
                      <button type="button" onClick={() => seek(line.time)}>
                        {line.text || "♪"}
                      </button>
                    </li>
                  ))
                : lyrics.plain?.map((line, i) => <li key={i}>{line || " "}</li>)}
            </ol>
          </>
        )}

        <p className="lyrics-credit">
          Lyrics from <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. Press Play when the song starts;
          tap a line to jump there.
        </p>
      </aside>
    </>
  );
}
