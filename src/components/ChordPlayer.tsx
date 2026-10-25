"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startAudio } from "@/audio/toneEngine";
import { chordPositionAt, chordStartTime, rescaleForTempo } from "@/lib/chordPlayer";
import { fingeringFor, parseProgression } from "@/lib/chordTrack";
import { BEATS_PER_CHORD_OPTIONS, LIMITS, activeChordSet, type ChordPlayerSettings } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";

interface ChordPlayerProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * A chord play-along, like the lyrics drawer: a looping progression on a
 * tempo clock, shown on screen with the fingers to use and a beat counter.
 */
export function ChordPlayer({ open, onToggle }: ChordPlayerProps) {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.getServer);
  const player = settings.chordPlayer;
  const chords = parseProgression(player.progression);
  const [draft, setDraft] = useState(player.progression);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastTick = useRef(0);
  const lastBeat = useRef(-1);

  const update = (patch: Partial<ChordPlayerSettings>) =>
    settingsStore.update({ chordPlayer: { ...settingsStore.get().chordPlayer, ...patch } });

  const setTime = (t: number) => {
    elapsedRef.current = Math.max(0, t);
    lastBeat.current = -1;
    setElapsed(elapsedRef.current);
  };

  // The clock: advance ~40×/s while playing, ticking the metronome on each new beat.
  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      elapsedRef.current += (now - lastTick.current) / 1000;
      lastTick.current = now;
      const { bpm, beatsPerChord, click } = settingsStore.get().chordPlayer;
      const beatsSoFar = Math.floor(elapsedRef.current / (60 / bpm));
      if (beatsSoFar !== lastBeat.current) {
        lastBeat.current = beatsSoFar;
        if (click) startAudio()?.click(beatsSoFar % beatsPerChord === 0);
        setElapsed(elapsedRef.current);
      }
    }, 25);
    return () => clearInterval(id);
  }, [playing]);

  // Read the saved values (not this render's) so quick repeated taps build on each other.
  const setTempo = (bpm: number | ((current: number) => number)) => {
    const current = settingsStore.get().chordPlayer.bpm;
    const wanted = typeof bpm === "function" ? bpm(current) : bpm;
    const next = Math.round(Math.min(LIMITS.bpm.max, Math.max(LIMITS.bpm.min, wanted)));
    if (next === current) return;
    setTime(rescaleForTempo(elapsedRef.current, current, next)); // stay on the same beat
    update({ bpm: next });
  };

  const setBeats = (beatsPerChord: ChordPlayerSettings["beatsPerChord"]) => {
    // Keep the current chord, restart its count.
    const { bpm, beatsPerChord: before } = settingsStore.get().chordPlayer;
    const pos = chordPositionAt(elapsedRef.current, bpm, before, chords.length);
    update({ beatsPerChord });
    setTime(pos ? chordStartTime(pos.index, bpm, beatsPerChord) : 0);
  };

  const pos = chordPositionAt(elapsed, player.bpm, player.beatsPerChord, chords.length);
  const current = pos ? chords[pos.index] : null;
  const next = pos && chords.length > 1 ? chords[(pos.index + 1) % chords.length] : null;
  const set = activeChordSet(settings);
  const fingering = current ? fingeringFor(set, current) : null;
  const showStrip = !!current && (playing || elapsed > 0);

  return (
    <>
      <button
        type="button"
        className={`chords-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="chords-drawer"
        onClick={onToggle}
      >
        {open ? "‹ Close" : "♫ Chords"}
      </button>

      {showStrip && (
        <div className="chord-strip" aria-live="polite">
          <span key={`${pos!.loop}-${pos!.index}`} className="chord-strip-name">
            {current}
          </span>
          <span className="chord-strip-hint">
            {fingering ? `Thumb + ${fingering}` : set ? "not in this chord set" : "scale mode"}
            {next && ` · next ${next}`}
          </span>
          <span className="chord-beats" aria-label={`Beat ${pos!.beat + 1} of ${player.beatsPerChord}`}>
            {Array.from({ length: player.beatsPerChord }, (_, b) => (
              <i key={b} className={b === pos!.beat ? "on" : b < pos!.beat ? "past" : undefined} />
            ))}
          </span>
        </div>
      )}

      <aside id="chords-drawer" className={`lyrics chords-drawer${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
        <h2>Chord play-along</h2>

        <form
          className="lyrics-search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ progression: draft });
            setTime(0);
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

        <div className="lyrics-controls">
          <button
            type="button"
            className="primary"
            disabled={!chords.length}
            onClick={() => {
              startAudio(); // unlock audio for the click, inside the tap
              setPlaying((p) => !p);
            }}
          >
            {playing ? "❚❚ Pause" : elapsed > 0 ? "▶ Resume" : "▶ Play"}
          </button>
          <button type="button" onClick={() => setTime(0)} aria-label="Restart">
            ⟲
          </button>
          <label className="chords-click">
            <input type="checkbox" checked={player.click} onChange={(e) => update({ click: e.target.checked })} />
            Click
          </label>
        </div>

        <div className="chords-tempo">
          <div className="drawer-slider-head">
            <span>Tempo</span>
            <output>{player.bpm} BPM</output>
          </div>
          <div className="chords-tempo-row">
            <button type="button" onClick={() => setTempo((b) => b - 5)} aria-label="Slower">
              −
            </button>
            <input
              type="range"
              min={LIMITS.bpm.min}
              max={LIMITS.bpm.max}
              step={LIMITS.bpm.step}
              value={player.bpm}
              onChange={(e) => setTempo(Number(e.target.value))}
              aria-label="Tempo in beats per minute"
            />
            <button type="button" onClick={() => setTempo((b) => b + 5)} aria-label="Faster">
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
                onClick={() => setBeats(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <ol className="chords-list">
          {chords.map((c, i) => (
            <li key={i} className={pos && i === pos.index && (playing || elapsed > 0) ? "active" : undefined}>
              <button type="button" onClick={() => setTime(chordStartTime(i, player.bpm, player.beatsPerChord))}>
                <strong>{c}</strong>
                <small>{fingeringFor(set, c) ?? (set ? "not in set" : "")}</small>
              </button>
            </li>
          ))}
        </ol>

        <p className="lyrics-credit">
          Loops until you pause. Tap a chord to jump to it. Changing the tempo keeps your place.
        </p>
      </aside>
    </>
  );
}
