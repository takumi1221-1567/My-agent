# Technical deep dive

The interesting engineering here isn't the chat — it's making a **video character feel continuously present**
on a phone, with **no 3D rig, no per-frame rendering, and no server**. Three problems, with the real code.

## 1. Seamless presence from short clips (the no-black-frame cross-fade)

A naive "swap the `<video>.src`" flashes black while the next clip buffers. The fix is a **double-buffer
cross-fade**: two stacked `<video>` elements, load the next clip into the hidden one, and only swap opacity
once it can actually play.

```js
// scene.js — two buffers, swap on ready
_crossfade(src) {
  if (this._current === src) return;
  this._current = src;
  this._seqId++;                       // invalidate any in-flight sequence (see §3)
  const next = this._back, prev = this._front;
  next.loop = true; next.muted = true; next.src = src; next.load();

  const doFade = () => {
    next.play().catch(() => { /* if autoplay-with-sound is blocked, retry muted */ });
    next.style.opacity = '1';
    prev.style.opacity = '0';
    this._front = next; this._back = prev;
    prev._fadeTimer = setTimeout(() => prev.pause(), 600);   // pause old buffer after the fade
  };

  if (next.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) doFade();
  else {                               // canplay → loadeddata → 3s timeout (never stall)
    next.addEventListener('canplay',    doFade, { once: true });
    next.addEventListener('loadeddata', doFade, { once: true });
    setTimeout(doFade, 3000);          // even an unsupported codec won't freeze the UI
  }
}
```

Why it matters:
- **Never a black frame** — the old clip stays visible at full opacity until the new one is ready.
- **Never a stall** — three escalating readiness signals (`canplay` → `loadeddata` → 3 s timeout) guarantee a
  swap even if a device can't decode a clip.
- **Cheap** — it's CSS opacity + two `<video>` tags. No WebGL, no canvas, no rig.

## 2. The state machine (one call to change "mood")

Presence is a tiny FSM (`STATE`): `idle / listening / thinking / talking / bored / wandering / sitting`.
`setState()` maps a state to a clip; idling states rotate variety so the character doesn't loop the same clip:

```js
let _lastIdling = null;
function pickIdling() {                 // never replay the same idle clip back-to-back
  const pool = IDLING_SRCS.filter(s => s !== _lastIdling);
  return (_lastIdling = pool[Math.floor(Math.random() * pool.length)]);
}
```

Everything in the app drives this one API: a mic tap → `THINKING`, a reply → `TALKING`, silence → `BORED`
and ambient `wandering`. Adding a mood = add a clip + a `case`.

## 3. The sequence engine (the outing drive)

The outing is a **list of clips played once, with the last one looped until interrupted** — "leave → door →
drive off → back seat (loop and wait) … → stop → home." That's `playSequence(srcs, onDone, loopLast,
onLoopStart, withSound)`. A monotonic `_seqId` makes interruption safe: if any `setState` fires mid-sequence,
the running sequence sees its id is stale and bows out, so a user command never collides with a playing clip.
The "back seat" loop emits an `onLoopStart` callback that the app uses to start idle small-talk while waiting.

## 4. The part everyone underestimates: iOS autoplay & audio

Mobile Safari blocks autoplay-with-sound and won't let JS set `volume`. The design works *with* that:
- Every clip is `muted` + `playsinline` and can autoplay; **loop clips stay muted forever** — the butler's
  voice comes from the Web Speech API (TTS), not the video.
- Sound for **event** clips (the drive) is unlocked only inside a real user gesture (`enableSound()` on the
  mic tap); `play()` failures fall back to muted so the **picture never stops** even if audio is refused.
- This is why the app boots straight into a tappable scene — the first tap is what unlocks audio.

## 5. Conversation: Gemini + Obsidian RAG (the keystone)

`functions/api/chat.js` is the only backend, and it does two things: **retrieve, then generate**.

```js
// retrieve: search the Obsidian mirror in D1, weight title/path hits ×3
const rows = await db.prepare(
  `SELECT path, chunk FROM vault_chunks WHERE chunk LIKE ? OR path LIKE ? LIMIT 200`
).bind(`%${term}%`, `%${term}%`).all();
// …score per Japanese keyword (kanji 2-grams + katakana + ASCII + kana→English synonyms), take top 8…
systemText += `\n\n=== 参考情報（自分の記憶として、出典に触れず自然に使う） ===\n${ctx}\n=== ここまで ===`;
// generate: Gemini with the persona + injected 参考情報
```

- **Japanese RAG that actually hits.** `extractKeywords` builds kanji **2-grams**, katakana/ASCII runs, and a
  kana→English synonym map (e.g. クロード→claude) so queries match notes written in mixed JP/EN; a hit in the
  **path/title scores ×3** over a body hit. Per term `LIMIT 200` so newly-synced notes aren't starved.
- **Grounding, not lookup.** The hits are injected as the butler's "memory" (出典に触れず自然に使う); the persona
  is told to say "存じ上げません" rather than invent facts not in the notes — this is the anti-hallucination contract.
- **Graceful without D1.** If `env.DB` is unset, `searchD1` returns `[]` and the butler answers as plain Gemini.
- The key lives in `env.GEMINI_API_KEY` (a Cloudflare secret) — never in client JS. `thinkingBudget = 0` keeps
  Flash latency low; 429/5xx retry then fall back to a second model; a 25 s timeout returns an error JSON so the
  UI recovers instead of hanging. D1 is a read-only lookup, so each request is still independent/stateless.

## 6. The media pipeline (where the clips come from)

All clips are generated from **one base character image** with per-state image-to-video prompts, with a hard
"change only the motion, keep everything else identical" constraint — that consistency is what lets §1's
cross-fades look like one continuous character. Full workflow + prompts: [MEDIA_PROMPTS.md](MEDIA_PROMPTS.md).

---

## Cost & performance (model, not benchmark)

> Rough guidance, not measured numbers — they depend on your Gemini tier, clip sizes, and device.

- **Hosting**: static PWA + one Function on Cloudflare Pages — fits the free tier for personal use; no server
  to run or scale. Conversation cost = Gemini API usage (one short call per turn).
- **Video**: re-encode clips to **~480p + `+faststart`** so playback starts within the cross-fade window — the
  single biggest factor in "feels instant" vs "black gap." Total clip set is a few MB.
- **Latency**: perceived latency = TTS start + one Gemini call; the cross-fade hides buffering. There's no
  per-frame rendering, so device GPU load is negligible vs a 3D/Live2D avatar.
- **No state**: each request is independent; nothing to scale but the (stateless) Function.

See also: [ADDING_FEATURES.md](ADDING_FEATURES.md), [MEDIA_PROMPTS.md](MEDIA_PROMPTS.md).
