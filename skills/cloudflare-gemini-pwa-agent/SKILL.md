---
name: cloudflare-gemini-pwa-agent
description: Build a phone-first voice AI agent as a PWA on Cloudflare Pages with a single Gemini-backed /api/chat function. Use when standing up a serverless conversational agent with no database, deployed to Cloudflare.
---

# Cloudflare + Gemini voice PWA agent

A minimal, serverless, phone-first conversational agent. No DB, no vendor lock-in beyond Cloudflare + Gemini.

## Shape
- **Front**: static PWA in `public/` (vanilla JS). Web Speech API for `ja-JP` recognition + synthesis. A
  state machine drives the UI; a mic tap captures speech → posts to the backend → speaks the reply.
- **Back**: one Pages Function `functions/api/chat.js` — `POST {message, history?} → {reply}` via the Gemini API.
- **Config**: `wrangler.toml` (`name`, `pages_build_output_dir = "public"`). No D1/KV needed for chat-only.

## chat.js essentials
- Read the key from `env.GEMINI_API_KEY` (server secret — never in client JS). Return 503 if missing.
- Call `…/v1beta/models/<model>:generateContent?key=…` with `systemInstruction` (persona) + `contents`.
- **Set `generationConfig.thinkingConfig.thinkingBudget = 0`** — Flash with thinking is slow → client timeouts.
- Primary model `gemini-3.1-flash-lite` (fast); on 429/5xx retry then fall back to `gemini-3.5-flash`.
- 25 s server timeout; on failure return an error JSON so the UI can recover instead of hanging.

## Deploy
```bash
npx wrangler pages deploy public --project-name=<name> --commit-dirty=true
npx wrangler pages secret put GEMINI_API_KEY --project-name=<name>
```
> Cloudflare Pages applies a newly set secret only to **new** deployments — redeploy after setting it.

## Gotchas
- **iOS**: audio/video autoplay is blocked until a user gesture; unlock TTS + video inside the mic-tap handler.
- **Cache**: bump a `?v=N` query on JS/CSS in `index.html`; PWA service workers cache aggressively.
- Keep the client free of secrets; the only network call from the browser is `/api/chat`.
