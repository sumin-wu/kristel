// Pure timing for the chord play-along: a looping progression at a tempo.

export interface ChordPosition {
  /** Index into the progression (loops). */
  index: number;
  /** Beat within the current chord, 0-based. */
  beat: number;
  /** Times the whole progression has looped. */
  loop: number;
}

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Where a looping progression is after `seconds` (null if there are no chords). */
export function chordPositionAt(seconds: number, bpm: number, beatsPerChord: number, count: number): ChordPosition | null {
  if (count <= 0 || bpm <= 0 || beatsPerChord <= 0) return null;
  const totalBeats = Math.max(0, Math.floor(seconds / secondsPerBeat(bpm) + 1e-9));
  const chordNumber = Math.floor(totalBeats / beatsPerChord);
  return {
    index: chordNumber % count,
    beat: totalBeats % beatsPerChord,
    loop: Math.floor(chordNumber / count),
  };
}

/** Seconds at which chord `index` (first pass) starts, for jumping to it. */
export function chordStartTime(index: number, bpm: number, beatsPerChord: number): number {
  return index * beatsPerChord * secondsPerBeat(bpm);
}

/**
 * Keep the same musical position when the tempo changes: the elapsed time at
 * the new tempo that sits on the same beat as `seconds` at the old tempo.
 */
export function rescaleForTempo(seconds: number, oldBpm: number, newBpm: number): number {
  return (seconds * oldBpm) / newBpm;
}
