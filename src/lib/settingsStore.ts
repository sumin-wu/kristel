// Settings store shared by React (useSyncExternalStore) and the per-frame loop (get()).
// Persists to localStorage; storage can be unavailable (private mode), so every access is guarded.

import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings";

const STORAGE_KEY = "gesture-synth.settings.v1";
/**
 * Bumped when a default should reach people who already have saved settings.
 * 3: every voice is now a Telecaster; old voice names fall back to Tele Clean.
 * 4: the guitar is acoustic; old voice names fall back to Acoustic Steel.
 */
const DEFAULTS_VERSION = 4;

let current: Settings | null = null;
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const json = JSON.parse(raw);
    const settings = parseSettings(json);
    if ((json?.defaultsVersion ?? 1) < DEFAULTS_VERSION) settings.preset = DEFAULT_SETTINGS.preset;
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const settingsStore = {
  get(): Settings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    current ??= load();
    return current;
  },

  getServer(): Settings {
    return DEFAULT_SETTINGS;
  },

  update(patch: Partial<Settings>): void {
    current = { ...settingsStore.get(), ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, defaultsVersion: DEFAULTS_VERSION }));
    } catch {
      // Not persisted this time; the in-memory settings still apply.
    }
    listeners.forEach((l) => l());
  },

  reset(): void {
    const { calibration, guideSeen } = settingsStore.get();
    settingsStore.update({ ...DEFAULT_SETTINGS, calibration, guideSeen });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
