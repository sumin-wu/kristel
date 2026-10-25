import { SCALES, type ScaleName } from "@/lib/gesture";
import { noteName } from "@/lib/pitch";
import {
  GESTURES,
  LIMITS,
  PRESETS,
  TARGETS,
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
          <h2>Scale</h2>
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
