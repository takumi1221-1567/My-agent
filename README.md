# My agent — a voice AI butler (template)

A phone‑first **voice‑interactive AI butler** with **lifelike character‑video presentation**, built as a
PWA on Cloudflare Pages. Tap, speak, and a video character answers — goes out for a drive on command, and
idles with ambient animations when you're quiet.

> **Portfolio template.** It does four things on purpose — conversation, an outing sequence, idling, and
> video presentation — so it stays small and anyone can reproduce (and extend) it.
> Companion project: [AI chat team in your Discord](https://github.com/takumi1221-1567/AI-chat-team-in-your-Discord).

---

## What it does

- 🎙 **Conversation** — tap the mic, speak; the butler replies (Gemini) while a talking video plays.
- 🚗 **Outing sequence** — say an outing trigger; a car/drive video sequence plays and waits, then returns.
- 😌 **Idling** — when idle, it cycles ambient "waiting" clips (reading, stretching, looking bored…).
- 🎬 **Video presentation** — every state is a short clip cross‑faded with no black frames.

Search, memory/RAG, calendar, face auth, etc. are intentionally **out of scope** — add what you need with
[docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md).

---

## 🤖 Hand it to Claude Code

This repo ships a build brief ([CLAUDE.md](CLAUDE.md)) that an AI coding agent reads automatically. Clone it,
open in Claude Code, and it will wire up `/api/chat`, help you add the character videos, deploy to Cloudflare,
and stop to ask you for the Gemini key and Cloudflare access. What's yours to provide is listed in CLAUDE.md.

## 60‑second start

```bash
git clone <this repo> && cd My-agent
echo "GEMINI_API_KEY=your-key" > .env          # conversation needs a Gemini key
npx wrangler pages deploy public --project-name=my-agent --commit-dirty=true
npx wrangler pages secret put GEMINI_API_KEY --project-name=my-agent
```
Open the URL on your phone, tap the mic, and talk. (Local static preview:
`python3 -m http.server 8080 --directory public`; `/api/chat` needs `wrangler pages dev` or production.)

---

## Architecture

```
[ phone/PC browser (PWA) ]
        │ tap + speech (Web Speech API)
        ▼
public/js/app.js   state machine (idle / listening / thinking / talking / outing)
   ├─ scene.js     two <video> elements, cross‑faded per state (no black frames)
   ├─ voice.js     speech recognition + synthesis (ja‑JP)
   └─ POST /api/chat
        ▼
functions/api/chat.js   →  Gemini API  →  { reply }      (no DB, no KV)
```

---

## Documentation

| Doc | What |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Build brief for Claude Code (autonomous build + what only you provide) |
| [docs/MEDIA_PROMPTS.md](docs/MEDIA_PROMPTS.md) | Generate the character image & video clips (with `prompts/`) |
| [docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md) | Add a new sequence/mode (worked example) |
| [prompts/](prompts/) | The image/video generation prompts (base image + per‑state motions) |
| [skills/](skills/) | Reusable how‑tos for an AI coding assistant |

---

## The character videos

The butler is just a set of short videos cross‑faded by state. Generate your own from a single base image
using the prompts in [`prompts/`](prompts/) — full workflow in [docs/MEDIA_PROMPTS.md](docs/MEDIA_PROMPTS.md).
Save clips into `public/videos/` with the filenames `app.js` expects.

---

## Configuration

- `GEMINI_API_KEY` — required for conversation. `.env` locally, `wrangler pages secret put` in production.
- `wrangler.toml` / `.github/workflows/deploy.yml` — set your project `name`.
- No database / KV required.

## License

MIT — see [LICENSE](LICENSE).
