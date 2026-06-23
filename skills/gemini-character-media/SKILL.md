---
name: gemini-character-media
description: Generate a consistent character base image and per-state video clips with an image/video model (e.g. Gemini), keeping appearance identical across clips. Use when producing the avatar media for a video-driven agent.
---

# Generating character image & video clips

Produce all of an agent's state clips from ONE base image so they look like the same character.

## Pipeline
```
reference → base image (front-facing, neutral) → image-to-video per state → .mp4 into public/videos/
```

1. **Base image.** Generate a clean, symmetrical, front-facing 3D character looking straight at camera.
   This single image anchors every clip.
2. **Per-state clips.** Feed the base image to an image-to-video model with one motion prompt per state
   (talking, idle variants, the outing/return steps).
3. **Install.** Save each clip with the filename the app expects; re-encode to 480p + faststart.

## The non-negotiable rule
Every motion prompt must constrain the model: **change only the described motion — keep appearance,
clothing, hair, colors, lighting, camera angle, framing, and background identical.** Without this, the
character drifts and cross-fades look wrong.

## A meta-prompt that writes the prompts
Keep a generator prompt that: (a) asks what action you want, (b) outputs an English image-to-video prompt,
(c) always includes the "do not change anything else" clause. This makes new states fast and consistent.

## Quality tips
- One motion per clip; keep clips 1–3 s. Loop idle clips; play sequence clips once.
- If a clip drifts, regenerate from the SAME base image with a stronger constraint clause.
- Storyboard sequences as a list of single-motion clips (e.g. leave-frame → key-spin wave → get-in → drive).
