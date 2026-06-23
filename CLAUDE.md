# CLAUDE.md — build brief for Claude Code

You are an AI engineer. This repository is a **template for a voice‑interactive AI butler** that runs
as a phone‑first PWA on Cloudflare Pages, with **lifelike character‑video presentation**. Take it from
"cloned template" to "deployed and talking," autonomously, pausing only for the few things only a human
can provide.

Read this first, then `README.md`, `docs/MEDIA_PROMPTS.md`, and `docs/ADDING_FEATURES.md`.

## What this agent is (scope)
Exactly four capabilities — keep it minimal:
1. **Conversation** — tap the mic, speak; the butler replies (Gemini) with a talking video.
2. **Outing sequence** — say an outing trigger; it plays a car/drive video sequence and waits, then returns.
3. **Idling** — when idle, it cycles ambient "waiting" videos (reading, stretching, looking bored…).
4. **Video presentation** — all states are short looping/transition videos cross‑faded with no black frames.

Anything else (search, memory/RAG, calendar, face auth, medical‑interview, drawing, TRPG) is intentionally
**out of scope** for this template. If asked to add one, follow `docs/ADDING_FEATURES.md`.

## Architecture
- `public/` — the PWA: `index.html`, `js/app.js` (state machine + sequences), `js/scene.js` (video cross‑fade),
  `js/voice.js` (Web Speech API), `manifest.json`, `videos/` (the character clips).
- `functions/api/chat.js` — the only backend: `POST {message} → {reply}` via the Gemini API. No DB/KV.
- `prompts/` — the image/video **generation prompts** used to create the character clips (see below).

## Build order (verify each step)
1. **Characters/videos.** The app needs the clips in `public/videos/`. Either reuse the included ones, or
   generate your own from `prompts/` (base image → per‑state image‑to‑video). See `docs/MEDIA_PROMPTS.md`.
   Keep the filenames `app.js` expects (search `OUTING_SEQUENCE`, `RETURN_SEQUENCE`, idle/talking clips).
2. **Gemini key.** Conversation needs `GEMINI_API_KEY`. Locally test `functions/api/chat.js` returns
   `{reply}`; in production set it with `wrangler pages secret put GEMINI_API_KEY`.
3. **Deploy.** `npx wrangler pages deploy public --project-name=<name> --commit-dirty=true`.
   Update `name` in `wrangler.toml` and `.github/workflows/deploy.yml`.
4. **Smoke test.** Open the URL on a phone, tap the mic, speak → expect a spoken reply + talking video.
   Say the outing trigger → expect the car sequence. Leave it idle → expect ambient videos.

## Ask the human (you cannot do these)
- A **Gemini API key** (AI Studio) → goes in `.env` locally / `wrangler pages secret put` in prod.
- A **Cloudflare account** + permission to deploy (and the account id / project name).
- **Generating the character videos** is a creative step done in an image/video model (e.g. Gemini) using
  `prompts/`. Offer to walk them through it, but the human runs the generation and drops the `.mp4`s in
  `public/videos/`.

## Guardrails
- **Never commit secrets.** Keys live in `.env` (git‑ignored) or Cloudflare secrets, never in code.
- **No personal data.** This is a public‑facing template — no real names, emails, tokens, account ids.
- **Keep it bootable.** The app must load straight into conversation (no auth gate). Don't reintroduce
  dependencies on endpoints that don't exist.
- If committing, set the author to the human's git identity; add no third‑party contributor.

## Definition of done
- [ ] `public/videos/` has the clips `app.js` references (idle, talking, outing sequence, return).
- [ ] `functions/api/chat.js` returns `{reply}` with a valid `GEMINI_API_KEY`.
- [ ] Deployed; phone test passes for conversation, outing, and idle.
- [ ] No secret or personal data committed; a fresh clone builds.

## Extending later
- **Add a feature** (a new sequence like a check‑in flow): `docs/ADDING_FEATURES.md` (worked example).
- **Make/replace the videos**: `docs/MEDIA_PROMPTS.md` + `prompts/`.
- Reusable how‑tos: `skills/*/SKILL.md`.
