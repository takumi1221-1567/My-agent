# My agent — a voice AI butler (template)

A phone‑first **voice‑interactive AI butler** whose core is **Gemini + Obsidian RAG** — it answers grounded in
**your own notes** — wrapped in **lifelike character‑video presentation**, built as a PWA on Cloudflare Pages.
Tap, speak, and a video character answers from your knowledge — goes out for a drive on command, and idles with
ambient animations when you're quiet.

> **Portfolio template.** Focused on purpose — **knowledge‑grounded conversation (Gemini + Obsidian RAG)**, an
> outing sequence, idling, and video presentation — so it stays small and anyone can reproduce (and extend) it.
> Companion project: [AI chat team in your Discord](https://github.com/takumi1221-1567/AI-chat-team-in-your-Discord).

---

## What it does

- 🧠 **Knowledge‑grounded conversation (the core)** — tap the mic, speak; the butler answers with **Gemini**,
  grounded in **your Obsidian notes** via RAG (a Cloudflare **D1** mirror of the vault is searched and injected
  as the butler's "memory"), while a talking video plays. Falls back to plain chat if no D1 is configured.
- 📝 **"Remember this"** — say 「覚えて ◯◯」 to store a confirmed fact (Cloudflare **KV**); it's injected as
  the butler's confirmed‑memory **(A)** on later turns (alongside the Obsidian RAG **(B)**), so it answers from it.
- 🚗 **Outing sequence** — say an outing trigger; a car/drive video sequence plays and waits, then returns.
- 😌 **Idling** — when idle, it cycles ambient "waiting" clips (reading, stretching, looking bored…).
- 🎬 **Video presentation** — every state is a short clip cross‑faded with no black frames.

Web search, calendar, face auth, etc. are intentionally **out of scope** —
add what you need with [docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md).

---

## How it's different

Giving an AI a "body" usually means a 3D rig, Live2D, or a per-frame renderer. This takes a narrower bet:

- **Presence from short video clips, cross‑faded — no rig, no GPU, no black frames.** Two stacked `<video>`
  elements swap on `canplay` with escalating fallbacks, so it never flashes black and never stalls (even on an
  unsupported codec). The mechanics are in [docs/TECHNICAL.md](docs/TECHNICAL.md).
- **Serverless & phone‑first.** A static PWA + one Cloudflare Function (`{message}→{reply}`). No server to run;
  the RAG uses Cloudflare **D1** (an Obsidian mirror), fits the free tier, and the API key stays server‑side.
- **One base image → a whole character.** Every state clip is generated from a single image with a strict
  "change only the motion" constraint, so all clips look like the same character ([docs/MEDIA_PROMPTS.md](docs/MEDIA_PROMPTS.md)).
- **Reproducible & extensible.** A build brief for Claude Code ([CLAUDE.md](CLAUDE.md)) and a 5‑piece recipe to
  add new behaviors ([docs/ADDING_FEATURES.md](docs/ADDING_FEATURES.md)).

| Approach | Rig / render | GPU load | Setup | Hosting |
|---|---|---|---|---|
| **This (cross‑faded clips)** | none — video files | negligible | generate clips + deploy | static + 1 Function |
| 3D avatar (Ready Player Me, etc.) | 3D model + animations | high (real‑time render) | model + rigging | app/runtime |
| Live2D / VTuber rig | 2D rig + parameters | medium | art + rigging | runtime |
| Talking‑head lip‑sync API | per‑frame generation | server‑side cost/latency | API integration | paid API |
| Plain text chatbot | none | none | trivial | any |

> The trade‑off is honest: you get realism cheaply but you can only show **pre‑generated motions** (not
> arbitrary real‑time animation). For a butler/companion with a fixed set of states, that's the point.

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
functions/api/chat.js
   ├─ search D1 (Obsidian mirror: vault_chunks)  →  inject as 参考情報 (RAG)
   └─ Gemini API (persona + 参考情報)            →  { reply }
```

---

## Documentation

| Doc | What |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Build brief for Claude Code (autonomous build + what only you provide) |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | **Deep dive** — the no‑black‑frame cross‑fade, state machine, sequence engine, iOS audio |
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

- `GEMINI_API_KEY` — required for generation. `.env` locally, `wrangler pages secret put` in production.
- **Cloudflare D1** (`[[d1_databases]]` in `wrangler.toml`, binding `DB`) — an Obsidian mirror with a
  `vault_chunks(path, chunk)` table, searched for RAG. Set `database_id` to your own. Without it, chat still
  works (plain Gemini, no grounding).
- `wrangler.toml` — set your project `name`. Deploy manually with `wrangler pages deploy` (no CI shipped).

## License

MIT — see [LICENSE](LICENSE).
