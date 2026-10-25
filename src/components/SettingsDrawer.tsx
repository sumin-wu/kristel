import { CHORD_NAMES, type ChordName } from "@/lib/chords";
import { SLOTS } from "@/lib/combos";
import { SCALES, type ScaleName } from "@/lib/gesture";
import { noteName } from "@/lib/pitch";
import {
  DEFAULT_CHORD_SETS,
  GESTURES,
  LIMITS,
  PRESETS,
  SCALE_SET,
  TARGETS,
  activeChordSet,
  assignChord,
  assignTarget,
  type Gesture,
  type Preset,
  type Settings,
  type Target,
} from "@/lib/settings";

interface SettingsDrawerProps {
  open: boolean;
  settings: Settings;
  onToggle: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onRecalibrate: () => void;
  onReset: () => void;
  onShowGuide: () => void;
  canCalibrate: boolean;
}

const KEYS = Array.from({ length: 12 }, (_, pc) => noteName(pc, { octave: false }));

function Slider({
  label,
  value,
  limits,
  format,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="drawer-slider">
      <span className="drawer-slider-head">
        <span>{label}</span>
        <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Switch chord sets, and choose which chord each finger combo plays. */
function ChordSetSection({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const set = activeChordSet(settings);
  const updateSet = (next: typeof set) =>
    next && onChange({ chordSets: settings.chordSets.map((x) => (x.id === next.id ? next : x)) });
  const defaults = set && DEFAULT_CHORD_SETS.find((d) => d.id === set.id);

  return (
    <section>
      <h2>Chord set</h2>
      <div className="drawer-segmented" role="radiogroup" aria-label="Chord set">
        {[...settings.chordSets.map((x) => ({ id: x.id, name: x.name })), { id: SCALE_SET, name: "Scale (key + scale)" }].map(
          (opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={settings.activeSet === opt.id}
              className={settings.activeSet === opt.id ? "on" : undefined}
              onClick={() => onChange({ activeSet: opt.id })}
            >
              {opt.name}
            </button>
          ),
        )}
      </div>

      {set ? (
        <>
          <table className="drawer-mapping drawer-chords">
            <thead>
              <tr>
                <th scope="col">Thumb +</th>
                <th scope="col">Chord</th>
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((slot) => (
                <tr key={slot.id} className={set.chords[slot.id] ? undefined : "empty"}>
                  <th scope="row">{slot.label}</th>
                  <td>
                    <select
                      aria-label={`Chord for thumb + ${slot.label}`}
                      value={set.chords[slot.id] ?? ""}
                      onChange={(e) => updateSet(assignChord(set, slot.id, (e.target.value || null) as ChordName | null))}
                    >
                      <option value="">—</option>
                      {CHORD_NAMES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="drawer-row-actions">
            <button
              type="button"
              className="quiet"
              onClick={() => defaults && updateSet({ ...set, chords: { ...defaults.chords } })}
            >
              Reset this set
            </button>
          </div>
          <p className="drawer-note">
            Touch your right thumb to these fingers. Combos of fingers landing together count as one. Avoid &ldquo;All four&rdquo; —
            it&apos;s close to a fist, and both fists stop the strings.
          </p>
        </>
      ) : (
        <p className="drawer-note">Chords come from the Key and Scale below. Index → pinky = degrees 1–4, index + middle = 5.</p>
      )}
    </section>
  );
}

export function SettingsDrawer({
  open,
  settings,
  onToggle,
  onChange,
  onRecalibrate,
  onReset,
  onShowGuide,
  canCalibrate,
}: SettingsDrawerProps) {
  return (
    <>
      <button
        type="button"
        className={`drawer-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="settings-drawer"
        onClick={onToggle}
      >
        {open ? "Close ›" : "‹ Settings"}
      </button>

      <aside id="settings-drawer" className={`drawer${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
        <ChordSetSection settings={settings} onChange={onChange} />

        <section>
          <h2>Voice</h2>
          <div className="drawer-segmented" role="radiogroup" aria-label="Voice preset">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={settings.preset === p}
                className={settings.preset === p ? "on" : undefined}
                onClick={() => onChange({ preset: p })}
              >
                {PRESETS[p].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Scale {settings.activeSet !== SCALE_SET && <span className="drawer-dim">(used in Scale mode)</span>}</h2>
          <div className="drawer-row">
            <label className="drawer-select">
              <span>Key</span>
              <select value={settings.key} onChange={(e) => onChange({ key: Number(e.target.value) })}>
                {KEYS.map((k, pc) => (
                  <option key={k} value={pc}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="drawer-select grow">
              <span>Scale</span>
              <select value={settings.scale} onChange={(e) => onChange({ scale: e.target.value as ScaleName })}>
                {(Object.keys(SCALES) as ScaleName[]).map((s) => (
                  <option key={s} value={s}>
                    {SCALES[s].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2>Sensitivity</h2>
          <Slider
            label="Pinch"
            value={settings.pinchSensitivity}
            limits={LIMITS.pinchSensitivity}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onChange({ pinchSensitivity: v })}
          />
          <Slider
            label="Bend range"
            value={settings.bendRange}
            limits={LIMITS.bendRange}
            format={(v) => `±${v} st`}
            onChange={(v) => onChange({ bendRange: v })}
          />
        </section>

        <section>
          <h2>Gesture mapping</h2>
          <table className="drawer-mapping">
            <tbody>
              {(Object.keys(GESTURES) as Gesture[]).map((g) => (
                <tr key={g}>
                  <th scope="row">{GESTURES[g].label}</th>
                  <td>
                    <select
                      aria-label={`${GESTURES[g].label} controls`}
                      value={settings.mapping[g]}
                      onChange={(e) => onChange({ mapping: assignTarget(settings.mapping, g, e.target.value as Target) })}
                    >
                      {(Object.keys(TARGETS) as Target[]).map((t) => (
                        <option key={t} value={t}>
                          {TARGETS[t].label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="drawer-note">Each effect follows one gesture; picking a taken one swaps them.</p>
        </section>

        <section>
          <h2>Display</h2>
          <label className="drawer-check">
            <input
              type="checkbox"
              checked={settings.showDebug}
              onChange={(e) => onChange({ showDebug: e.target.checked })}
            />
            <span>Debug overlay (stats and hand skeleton)</span>
          </label>
        </section>

        <section className="drawer-actions">
          <button type="button" onClick={onRecalibrate} disabled={!canCalibrate}>
            Recalibrate pinch
          </button>
          <button type="button" className="quiet" onClick={onShowGuide} disabled={!canCalibrate}>
            Show the guide again
          </button>
          <button type="button" className="quiet" onClick={onReset}>
            Reset settings
          </button>
          <p className="drawer-note">
            {settings.calibration
              ? `Calibrated: pinch below ${settings.calibration.start.toFixed(2)}, release above ${settings.calibration.release.toFixed(2)}`
              : "Not calibrated yet — using default thresholds."}
          </p>
        </section>
      </aside>
    </>
  );
}
