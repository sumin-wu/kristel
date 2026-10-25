// Lyrics from LRCLIB (https://lrclib.net): free, no API key, often time-synced.
// Parsing is pure and tested; fetching is a thin wrapper.

export interface LyricLine {
  /** Seconds from the start of the song. */
  time: number;
  text: string;
}

export interface Lyrics {
  trackName: string;
  artistName: string;
  /** Song length in seconds, if known. */
  duration: number | null;
  /** Time-synced lines, when LRCLIB has them. */
  synced: LyricLine[] | null;
  /** Untimed lyrics, one line per entry. */
  plain: string[] | null;
  instrumental: boolean;
}

const TIMESTAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** Parse LRC text ("[mm:ss.xx] line"), including lines with several timestamps. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (!stamps.length) continue;
    const text = raw.replace(TIMESTAMP, "").trim();
    for (const [, min, sec] of stamps) lines.push({ time: Number(min) * 60 + Number(sec), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line being sung at `seconds` (-1 before the first line). */
export function activeLineIndex(lines: readonly LyricLine[], seconds: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

interface LrclibTrack {
  trackName: string;
  artistName: string;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Shape an LRCLIB track into Lyrics. */
export function toLyrics(track: LrclibTrack): Lyrics {
  const synced = track.syncedLyrics ? parseLrc(track.syncedLyrics) : null;
  const plain = track.plainLyrics ? track.plainLyrics.split(/\r?\n/) : null;
  return {
    trackName: track.trackName,
    artistName: track.artistName,
    duration: track.duration ?? null,
    synced: synced?.length ? synced : null,
    plain,
    instrumental: !!track.instrumental,
  };
}

const API = "https://lrclib.net/api";
const HEADERS = { "Lrclib-Client": "FretSynth (https://www.kristelacester.com)" };

/**
 * Look up lyrics: an exact artist + title match first, then the best search
 * result. Resolves to null when nothing is found.
 */
export async function fetchLyrics(artist: string, title: string, signal?: AbortSignal): Promise<Lyrics | null> {
  const exact = new URL(`${API}/get`);
  exact.searchParams.set("artist_name", artist.trim());
  exact.searchParams.set("track_name", title.trim());
  const res = await fetch(exact, { headers: HEADERS, signal });
  if (res.ok) return toLyrics((await res.json()) as LrclibTrack);
  if (res.status !== 404) throw new Error(`Lyrics service error (${res.status})`);

  const search = new URL(`${API}/search`);
  search.searchParams.set("q", `${artist} ${title}`.trim());
  const found = await fetch(search, { headers: HEADERS, signal });
  if (!found.ok) throw new Error(`Lyrics service error (${found.status})`);
  const results = (await found.json()) as LrclibTrack[];
  const best = results.find((r) => r.syncedLyrics) ?? results.find((r) => r.plainLyrics) ?? results[0];
  return best ? toLyrics(best) : null;
}
