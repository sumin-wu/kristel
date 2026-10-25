@AGENTS.md

# FretSynth

Touchscreen guitar synth for a guitarist playing with her fingers on a phone/tablet in landscape.

## Instrument mapping (source of truth)
- Left 60%: fretboard window, 6 rows (strings, high E on top like tab) × 4 columns (frets).
- Right 40%: 6 pluck strips aligned to the rows.
- Position control shifts the window by 1 fret (frets 1–4 up to 12–15).
- Standard tuning MIDI: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64.
- Pitch = open string + highest held fret on that string; no fret held = open string.
- Each string is monophonic; the instrument is polyphonic across strings.

## Architecture
- src/lib/pitch.ts: pure functions (tunings, fret→MIDI, MIDI→Hz, note names). Unit tested.
- src/lib/touch.ts: pointer tracking state (which pointer holds which cell/strip). Unit tested.
- src/audio/karplus.ts: pure Karplus-Strong renderer (Float32Array out). Unit tested.
- src/audio/engine.ts: Web Audio engine, one voice per string. No React in here.
- src/components/: Fretboard, PluckStrips, TopBar. Thin UI only.
- src/app/page.tsx: composes everything, client component.

## Conventions
- Pointer Events only (no touch/mouse events). touch-action: none on the play surface.
- Unlock the AudioContext on first pointerdown (iOS).
- Keep audio scheduling off React state; use refs.
- Run `npx vitest run` and `npm run build` before calling a task done.
