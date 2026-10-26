"use client";

// The tempo chord clock for the play-along: a looping progression at a BPM,
// with an optional metronome click.

import { useEffect, useRef, useState } from "react";
import { startAudio } from "@/audio/toneEngine";
import { chordPositionAt, chordStartTime, rescaleForTempo } from "@/lib/chordPlayer";
import { parseProgression } from "@/lib/chordTrack";
import { LIMITS, type ChordPlayerSettings } from "@/lib/settings";
import { settingsStore } from "@/lib/settingsStore";

export function useChordClock(player: ChordPlayerSettings) {
  const chords = parseProgression(player.progression);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastBeat = useRef(-1);

  const update = (patch: Partial<ChordPlayerSettings>) =>
    settingsStore.update({ chordPlayer: { ...settingsStore.get().chordPlayer, ...patch } });

  const setTime = (t: number) => {
    elapsedRef.current = Math.max(0, t);
    lastBeat.current = -1;
    setElapsed(elapsedRef.current);
  };

  // Advance ~40×/s while playing, ticking the metronome on each new beat.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      elapsedRef.current += (now - last) / 1000;
      last = now;
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
    const at = chordPositionAt(elapsedRef.current, bpm, before, chords.length);
    update({ beatsPerChord });
    setTime(at ? chordStartTime(at.index, bpm, beatsPerChord) : 0);
  };

  const pos = chordPositionAt(elapsed, player.bpm, player.beatsPerChord, chords.length);

  return {
    chords,
    playing,
    setPlaying,
    elapsed,
    setTime,
    setTempo,
    setBeats,
    update,
    jumpTo: (index: number) => setTime(chordStartTime(index, player.bpm, player.beatsPerChord)),
    pos,
    current: pos ? chords[pos.index] : null,
    next: pos && chords.length > 1 ? chords[(pos.index + 1) % chords.length] : null,
  };
}

export type ChordClockState = ReturnType<typeof useChordClock>;
