---
name: character-video-presentation
description: Give an AI agent a lifelike on-screen body using short looping/transition videos cross-faded by state (idle/talking/sequences) with no black frames. Use when building a character avatar driven by video clips rather than a 3D rig.
---

# Character video presentation

Make an agent feel "present" with cheap video instead of a 3D/live2D rig: one short clip per state,
cross-faded so transitions are seamless.

## Model
- A **state machine**: `IDLE`, `LISTENING`, `THINKING`, `TALKING`, plus sequence states (e.g. outing).
- A **scene controller** holds two stacked `<video>` elements; to change state it loads the next clip into the
  hidden one, starts it, then **cross-fades** (swap `active` class) — so there's never a black frame.
- **Idle** loops ambient clips (waiting, reading, stretching…) and can rotate them on a timer.
- **Sequences** (e.g. leave → get in car → drive → return) play clips once in order, looping the "wait" clip
  until the user speaks the exit trigger.

## Implementation tips
- Preload `preload="auto"`, `muted` + `playsinline` for iOS; enable sound only after a user gesture.
- Re-encode clips to ~480p + `+faststart` so playback starts instantly (a major cause of black gaps).
- Drive everything through one `setState(STATE.X)` API; map each state to a clip filename in one place.
- Keep clip filenames in named constants so generated media and code stay in sync.
- Loop short idle clips; play transition/sequence clips once with an `onended` → next-state handler.

## Where the clips come from
Generate them from a single base character image with per-state image-to-video prompts (see the
`gemini-character-media` skill). The rule: change only the motion, keep everything else identical, so all
clips look like the same character.
