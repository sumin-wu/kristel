"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startAudio } from "@/audio/toneEngine";
import { fingeringFor, parseProgression } from "@/lib/chordTrack";
import { CHORD_NAMES, type ChordName } from "@/lib/chords";
import { BEATS_PER_CHORD_OPTIONS, LIMITS, activeChordSet } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";
import { useChordClock } from "./useChordClock";
import { SPEEDS, useLyrics } from "./useLyrics";

interface PlayAlongPanelProps {
  open: boolean;
  onToggle: () => void;
}

type Tab = "lyrics" | "chords";

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One play-along panel: lyrics and chords together. A shared transport starts
 * both; the on-screen card shows the chord (with fingers) above the lyric line.
 */
export function PlayAlongPanel({ open, onToggle }: PlayAlongPanelProps) {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  const player = settings.chordPlayer;
  const followTempo = player.follow === "tempo";
  const lyrics = useLyrics();
  const clock = useChordClock(player);
  const [tab, setTab] = useState<Tab>("lyrics");
  const [draft, setDraft] = useState(player.progression);
  const listRef = useRef<HTMLOListElement>(null);

  const set = activeChordSet(settings);
  const canLyrics = !!lyrics.synced;
  const canTempo = followTempo && clock.chords.length > 0;
  const playing = lyrics.playing || clock.playing;
  const started = playing || lyrics.elapsed > 0 || clock.elapsed > 0;

  const toggleOpen = () => {
    onToggle();
    if (lyrics.status.kind === "idle") void lyrics.search();
  };

  const play = () => {
    startAudio(); // unlocks audio (metronome) inside the tap
    if (canLyrics) lyrics.setPlaying(true);
    if (canTempo) clock.setPlaying(true);
  };
  const pause = () => {
    lyrics.setPlaying(false);
    clock.setPlaying(false);
  };
  const restart = () => {
    lyrics.seek(0);
    clock.setTime(0);
  };

  // Switching what chords follow: stop the tempo clock when it no longer drives anything.
  const setFollow = (follow: "lyrics" | "tempo") => {
    clock.update({ follow });
    if (follow === "lyrics") clock.setPlaying(false);
    else if (lyrics.playing && clock.chords.length) clock.setPlaying(true);
  };

  // Keep the active lyric line in view.
  useEffect(() => {
    if (!open || tab !== "lyrics" || lyrics.active < 0) return;
    listRef.current?.children[lyrics.active]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [lyrics.active, open, tab]);

  // The on-screen card.
  const chord: ChordName | null = followTempo ? clock.current : lyrics.nowChord;
  const nextChord = followTempo ? clock.next : lyrics.upcomingChord;
  const fingering = chord ? fingeringFor(set, chord) : null;
  const showCard = started && (!!chord || (canLyrics && lyrics.elapsed > 0));
  const showLyricLines = canLyrics && (lyrics.playing || lyrics.elapsed > 0);

  return (
    <>
      <button
        type="button"
        className={`playalong-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="playalong-drawer"
        onClick={toggleOpen}
      >
        {open ? "‹ Close" : "♪ Play-along"}
      </button>

      {showCard && (
        <div className="playalong-card" aria-live="polite">
          {chord && (
            <div className="playalong-chord">
              <span key={`${chord}-${followTempo ? clock.pos?.index : lyrics.active}`} className="playalong-chord-name">
                {chord}
              </span>
              <span className="playalong-chord-hint">
                {fingering ? `Thumb + ${fingering}` : set ? "not in this chord set" : "scale mode"}
                {nextChord && ` · next ${nextChord}`}
              </span>
              {followTempo && clock.pos && (
                <span className="chord-beats" aria-label={`Beat ${clock.pos.beat + 1} of ${player.beatsPerChord}`}>
                  {Array.from({ length: player.beatsPerChord }, (_, b) => (
                    <i key={b} className={b === clock.pos!.beat ? "on" : b < clock.pos!.beat ? "past" : undefined} />
                  ))}
                </span>
              )}
            </div>
          )}
          {showLyricLines && (
            <div className="playalong-lyrics">
              <p className="karaoke-current">{lyrics.current || "♪"}</p>
              {lyrics.next && <p className="karaoke-next">{lyrics.next}</p>}
            </div>
          )}
        </div>
      )}

      <aside id="playalong-drawer" className={`lyrics playalong${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
        <h2>Play-along</h2>

        {/* Shared transport */}
        <div className="lyrics-controls">
          <button type="button" className="primary" disabled={!canLyrics && !canTempo} onClick={playing ? pause : play}>
            {playing ? "❚❚ Pause" : started ? "▶ Resume" : "▶ Play"}
          </button>
          <button type="button" onClick={restart} aria-label="Restart">
            ⟲
          </button>
          <span className="lyrics-time">
            {canLyrics
              ? `${formatTime(lyrics.elapsed)}${lyrics.lyrics?.duration ? ` / ${formatTime(lyrics.lyrics.duration)}` : ""}`
              : canTempo
                ? `${player.bpm} BPM`
                : ""}
          </span>
        </div>

        <div className="playalong-follow">
          <span>Chords follow</span>
          <div className="drawer-segmented" role="radiogroup" aria-label="Chords follow">
            {(
              [
                ["lyrics", "Lyrics"],
                ["tempo", "Tempo"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={player.follow === value}
                className={player.follow === value ? "on" : undefined}
                onClick={() => setFollow(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!canLyrics && !canTempo && (
          <p className="lyrics-note">
            {followTempo ? "Add a progression in the Chords tab." : "Load synced lyrics, or switch chords to follow Tempo."}
          </p>
        )}

        <div className="playalong-tabs" role="tablist">
          {(
            [
              ["lyrics", "Lyrics"],
              ["chords", "Chords"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "on" : undefined}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "lyrics" ? (
          <>
            <form
              className="lyrics-search"
              onSubmit={(e) => {
                e.preventDefault();
                void lyrics.search();
              }}
            >
              <input
                aria-label="Artist"
                placeholder="Artist"
                value={lyrics.artist}
                onChange={(e) => lyrics.setArtist(e.target.value)}
              />
              <input
                aria-label="Song"
                placeholder="Song"
                value={lyrics.title}
                onChange={(e) => lyrics.setTitle(e.target.value)}
              />
              <button type="submit" disabled={lyrics.status.kind === "loading" || !lyrics.title.trim()}>
                {lyrics.status.kind === "loading" ? "Searching…" : "Find lyrics"}
              </button>
            </form>

            {lyrics.status.kind === "missing" && (
              <p className="lyrics-note">No lyrics found. Check the spelling, or try just the song title.</p>
            )}
            {lyrics.status.kind === "error" && <p className="lyrics-note error">{lyrics.status.message}</p>}

            {lyrics.lyrics && (
              <>
                <div className="playalong-row">
                  <p className="lyrics-track">
                    <strong>{lyrics.lyrics.trackName}</strong> · {lyrics.lyrics.artistName}
                    <span>{lyrics.synced ? " · synced" : " · not synced"}</span>
                  </p>
                  {lyrics.synced && (
                    <select
                      className="lyrics-speed"
                      aria-label="Lyrics speed"
                      value={lyrics.speed}
                      onChange={(e) => lyrics.setSpeed(Number(e.target.value))}
                    >
                      {SPEEDS.map((x) => (
                        <option key={x} value={x}>
                          {Math.round(x * 100)}%
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {!followTempo && (
                  <form
                    className="chords-fill"
                    onSubmit={(e) => {
                      e.preventDefault();
                      lyrics.fillLines();
                    }}
                  >
                    <input
                      aria-label="Chord progression for the lines"
                      placeholder="Progression, e.g. C G Am F"
                      value={lyrics.progression}
                      onChange={(e) => lyrics.setProgression(e.target.value)}
                    />
                    <button type="submit" disabled={!parseProgression(lyrics.progression).length}>
                      Fill lines
                    </button>
                    <button type="button" className="quiet" onClick={lyrics.clearChords}>
                      Clear
                    </button>
                  </form>
                )}
                {!followTempo && lyrics.trackAuto && (
                  <p className="lyrics-note">
                    Chords were filled from the progression, one per line. Change any line&apos;s chord to match the song.
                  </p>
                )}

                <ol className="lyrics-lines" ref={listRef}>
                  {lyrics.lines.map((text, i) => (
                    <li key={i} className={i === lyrics.active ? "active" : i < lyrics.active ? "past" : undefined}>
                      {!followTempo && (
                        <select
                          className={`line-chord${lyrics.track[i] ? "" : " empty"}`}
                          aria-label={`Chord for line ${i + 1}`}
                          value={lyrics.track[i] ?? ""}
                          onChange={(e) => lyrics.setLineChord(i, (e.target.value || null) as ChordName | null)}
                        >
                          <option value="">·</option>
                          {CHORD_NAMES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      )}
                      {lyrics.synced ? (
                        <button type="button" onClick={() => lyrics.seek(lyrics.synced![i].time)}>
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
              Lyrics from{" "}
              <a href="https://lrclib.net" target="_blank" rel="noreferrer">
                LRCLIB
              </a>
              . Tap a line to jump there. Line chords are saved per song in this browser.
            </p>
          </>
        ) : (
          <>
            <form
              className="lyrics-search"
              onSubmit={(e) => {
                e.preventDefault();
                clock.update({ progression: draft });
                clock.setTime(0);
              }}
            >
              <input
                aria-label="Chord progression"
                placeholder="e.g. C G Am F"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" disabled={!parseProgression(draft).length}>
                Use progression
              </button>
            </form>

            {!followTempo && (
              <p className="lyrics-note">
                The on-screen chord follows the lyric lines right now. Switch &ldquo;Chords follow&rdquo; to Tempo to play this
                progression at a BPM instead.
              </p>
            )}

            <div className="chords-tempo">
              <div className="drawer-slider-head">
                <span>Tempo</span>
                <output>{player.bpm} BPM</output>
              </div>
              <div className="chords-tempo-row">
                <button type="button" onClick={() => clock.setTempo((b) => b - 5)} aria-label="Slower">
                  −
                </button>
                <input
                  type="range"
                  min={LIMITS.bpm.min}
                  max={LIMITS.bpm.max}
                  step={LIMITS.bpm.step}
                  value={player.bpm}
                  onChange={(e) => clock.setTempo(Number(e.target.value))}
                  aria-label="Tempo in beats per minute"
                />
                <button type="button" onClick={() => clock.setTempo((b) => b + 5)} aria-label="Faster">
                  +
                </button>
              </div>
            </div>

            <div className="chords-beats-setting">
              <span>Beats per chord</span>
              <div className="drawer-segmented" role="radiogroup" aria-label="Beats per chord">
                {BEATS_PER_CHORD_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={player.beatsPerChord === n}
                    className={player.beatsPerChord === n ? "on" : undefined}
                    onClick={() => clock.setBeats(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <label className="chords-click">
              <input type="checkbox" checked={player.click} onChange={(e) => clock.update({ click: e.target.checked })} />
              Metronome click
            </label>

            <ol className="chords-list">
              {clock.chords.map((c, i) => (
                <li key={i} className={followTempo && clock.pos && i === clock.pos.index && started ? "active" : undefined}>
                  <button type="button" onClick={() => clock.jumpTo(i)}>
                    <strong>{c}</strong>
                    <small>{fingeringFor(set, c) ?? (set ? "not in set" : "")}</small>
                  </button>
                </li>
              ))}
            </ol>
            <p className="lyrics-credit">Loops until you pause. Tap a chord to jump to it. Changing the tempo keeps your place.</p>
          </>
        )}
      </aside>
    </>
  );
}
