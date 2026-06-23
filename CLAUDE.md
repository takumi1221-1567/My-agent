# CLAUDE.md — build brief for Claude Code

You are an AI engineer. This repository is a **template for a voice‑interactive AI butler** that runs
as a phone‑first PWA on Cloudflare Pages, with **lifelike character‑video presentation**. Take it from
"cloned template" to "deployed and talking," autonomously, pausing only for the few things only a human
can provide.

Read this first, then `README.md`, `docs/TECHNICAL.md` (how the presentation works), `docs/MEDIA_PROMPTS.md`, and `docs/ADDING_FEATURES.md`.

## What this agent is (scope)
The core capabilities — keep it minimal:
1. **Knowledge‑grounded conversation (the core)** — tap the mic, speak; the butler answers with **Gemini**,
   grounded in the user's **Obsidian notes via RAG** (search a Cloudflare **D1** mirror's `vault_chunks` table,
   inject the hits as 参考情報 into the system prompt), with a talking video. **This Gemini + Obsidian RAG is
   the keystone — never remove it.** (If `env.DB` is unset, `chat.js` falls back to plain Gemini.)
2. **Outing sequence** — say an outing trigger; it plays a car/drive video sequence and waits, then returns.
3. **Idling** — when idle, it cycles ambient "waiting" videos (reading, stretching, looking bored…).
4. **Video presentation** — all states are short looping/transition videos cross‑faded with no black frames.

5. **"Remember this" memory (A)** — say 「覚えて ◯◯」 → `app.js` POSTs to `/api/memory` (KV `MEMORY`, optional
   D1 `memories`); `chat.js` reads recent memories from KV and injects them as confirmed‑memory **(A)** in the
   system prompt (alongside the Obsidian RAG **(B)**). Keep this — it pairs with the RAG.

Anything else (web search, calendar, face auth, medical‑interview, drawing, TRPG) is intentionally
**out of scope** for this template. If asked to add one, follow `docs/ADDING_FEATURES.md`.

## Architecture
- `public/` — the PWA: `index.html`, `js/app.js` (state machine + sequences), `js/scene.js` (video cross‑fade),
  `js/voice.js` (Web Speech API), `manifest.json`, `videos/` (the character clips).
- `functions/api/chat.js` — the only backend: searches D1 (`vault_chunks`) for RAG, then calls Gemini.
  `POST {message} → {reply}`. Binding `DB` = Obsidian‑mirror D1 (`wrangler.toml`); key = `env.GEMINI_API_KEY`.
- `prompts/` — the image/video **generation prompts** used to create the character clips (see below).

## Build order (verify each step)
1. **Characters/videos.** The app needs the clips in `public/videos/`. Either reuse the included ones, or
   generate your own from `prompts/` (base image → per‑state image‑to‑video). See `docs/MEDIA_PROMPTS.md`.
   Keep the filenames `app.js` expects (search `OUTING_SEQUENCE`, `RETURN_SEQUENCE`, idle/talking clips).
2. **Gemini key.** Generation needs `GEMINI_API_KEY`. Locally test `functions/api/chat.js` returns
   `{reply}`; in production set it with `wrangler pages secret put GEMINI_API_KEY`.
3. **D1 + Obsidian RAG (the core).** Create a D1 DB with a `vault_chunks(path, chunk)` table that mirrors the
   user's Obsidian vault, set its `database_id` under `[[d1_databases]]` (binding `DB`) in `wrangler.toml`, and
   keep it in sync (the user owns the sync job). Verify a question about a known note comes back grounded.
   (Without D1, chat still works as plain Gemini — but RAG is the keystone; don't ship it disabled.)
4. **Deploy.** `npx wrangler pages deploy public --project-name=<name> --commit-dirty=true`. Update `name` in
   `wrangler.toml`. Deploy is manual — do **not** add an auto‑deploy CI to this template.
5. **Smoke test.** Open the URL on a phone, tap the mic, ask about something in the notes → expect a grounded
   spoken reply + talking video. Say the outing trigger → car sequence. Leave it idle → ambient videos.

## Ask the human (you cannot do these)
- A **Gemini API key** (AI Studio) → goes in `.env` locally / `wrangler pages secret put` in prod.
- A **Cloudflare account** + permission to deploy (and the account id / project name).
- Their **D1 database id** and an **Obsidian→D1 sync** (the `vault_chunks` content) — the RAG knowledge source.
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
- [ ] **D1 `vault_chunks` is bound and populated; a question about a known note returns a grounded answer.**
- [ ] Deployed; phone test passes for grounded conversation, outing, and idle.
- [ ] No secret or personal data committed; no auto‑deploy CI; a fresh clone builds.

## Extending later
- **Add a feature** (a new sequence like a check‑in flow): `docs/ADDING_FEATURES.md` (worked example).
- **Make/replace the videos**: `docs/MEDIA_PROMPTS.md` + `prompts/`.
- Reusable how‑tos: `skills/*/SKILL.md`.
