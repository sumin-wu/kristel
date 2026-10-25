@AGENTS.md

# FretSynth

Touchscreen guitar synth for a guitarist playing with her fingers on a phone/tablet in landscape.

## Routes
- `/` — landing (birthday, spider theme): strum B minor on the top four strings
  (xx4432; low E and A muted), it resolves into C minor (xx5543), then opens `/home`.
- `/home` — two-hand camera gesture synth (Tone.js). Mapping below.
- `/fretsynth` — earlier pinch-fret + touch-strip instrument (Karplus-Strong engine).

## Gesture synth mapping (/home)
- Right hand plays: thumb pinch to index/middle/ring/pinky = scale degree 1–4,
  index+middle together = 5. Pinch starts below 0.25 and releases above 0.35
  (or per-user calibrated thresholds, scaled by the sensitivity slider).
- Left hand picks the octave: none = 3, index = 4, middle = 5.
- Every sound is one Telecaster-style guitar (`src/audio/toneEngine.ts`, presets
  Tele Clean / Twang / Crunch). A pinch-start strums the diatonic chord on that
  note (long strum, velocity from closing speed); sliding a held pinch strums the
  next chord along the scale; chords ring out on release.
- Continuous gestures (lerp 0.15), reassignable in Settings: right-hand height →
  filter, right-hand roll → bend, hand distance → reverb, left-hand openness → distortion.
- Settings persist to localStorage (`src/lib/settingsStore.ts`).
- First visit shows a guide (Start/Skip, once; `guideSeen`): gestures, then the
  chord roots of girl in red's "we fell in love in october" (Cmaj7 Gmaj7 C G D,
  in G major); each correct pinch strums the full chord.
- Chord voicings: fixed shapes and generated E/A-shape barres in `src/lib/chords.ts`.

## FretSynth instrument mapping (/fretsynth)
- Left 60%: front camera tracking her fretting hand. The thumb is the constant
  "resting" finger; touching it to index/middle/ring/pinky selects fret 1/2/3/4
  of the current window (index = lowest fret). No pinch = open strings.
- Right 40%: 6 pluck strips (high E on top like tab). Tap to pluck, drag to strum.
- Position control shifts the window by 1 fret (frets 1–4 up to 12–15).
- Standard tuning MIDI: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64.
- Pitch = open string + pinched fret, applied to whichever string is plucked.
- A pinch alone is silent; the strip pluck starts the note. A note plucked while
  pinched sustains until that pinch opens, then fades (~120 ms). Open-string
  plucks ring out and decay (~3 s).
- Each string is monophonic; the instrument is polyphonic across strings.

## Architecture
- src/lib/pitch.ts: pure functions (tunings, fret→MIDI, MIDI→Hz, note names). Unit tested.
- src/lib/touch.ts: pointer tracking state (which pointer holds which cell/strip). Unit tested.
- src/lib/pinch.ts: thumb-to-finger pinch detection from hand landmarks (hysteresis). Unit tested.
- src/vision/handTracker.ts: camera + MediaPipe HandLandmarker loop. No React in here.
- src/audio/karplus.ts: pure Karplus-Strong renderer (Float32Array out). Unit tested.
- src/audio/engine.ts: Web Audio engine, one voice per string. No React in here.
- src/components/: UI components (CameraPanel, PluckStrips, TopBar, StrumIntro, GestureView, SettingsDrawer).
- src/lib/gesture.ts, controls.ts, settings.ts, calibration.ts, strum.ts: pure gesture-synth logic. Unit tested.
- src/audio/toneEngine.ts: Tone.js Telecaster (6 string voices → pickup EQ → vibrato → bend → amp → tone → reverb).
- src/components/gestureSession.ts: per-frame glue (hands → notes/params → audio, canvas, HUD). No React state per frame.
- src/app/*/page.tsx: thin route files composing components.

## Conventions
- Pointer Events only (no touch/mouse events). touch-action: none on the play surface.
- Unlock the AudioContext on first pointerdown (iOS).
- Camera needs a secure context: localhost, or `npm run dev:lan` (HTTPS) for a phone.
- Keep audio scheduling off React state; use refs.
- The dev server sometimes keeps serving a stale globals.css; if a style change
  doesn't show, stop `next dev`, delete `.next`, and start it again.
- Run `npx vitest run` and `npm run build` before calling a task done.
