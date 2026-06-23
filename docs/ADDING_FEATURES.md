# Adding a feature (a new sequence)

This template ships only conversation + outing + idle + video. New behaviors are added as **sequences/modes**
following one consistent pattern. Below is the recipe, then a worked example (a simple "check‑in" / 問診 flow).

## The pattern (5 pieces)

Everything lives in `public/js/app.js`. A mode is:

1. **Trigger words** — a constant array of phrases that start the mode.
   ```js
   const CHECKIN_TRIGGERS = ['体調', '具合', 'チェックイン'];
   ```
2. **A state flag** — declared in the constructor.
   ```js
   this._checkinMode = false;
   ```
3. **A dispatch entry** in `_onUserSpeech(text)` — route speech while in the mode, and a trigger to enter it.
   ```js
   // near the top of _onUserSpeech, with the other `if (this._xMode) {...}` blocks:
   if (this._checkinMode) { this._handleCheckinSpeech(text, _match); return; }
   // with the other `if (_match(...))` triggers:
   if (_match(CHECKIN_TRIGGERS)) { this._cancelLocalAI(); this._startCheckin(text); return; }
   ```
   Also add `this._checkinMode` to the **guard expressions** (search `this._outingMode || this._goMode`)
   so idle/wander logic pauses while your mode runs.
4. **Handlers** — start, per‑turn, and finish.
   ```js
   _startCheckin(text) {
     this._checkinMode = true;
     this.scene.setState(STATE.TALKING);
     this._say('承知しました。順番に伺います。今日はどのようなご様子ですか？');
   }
   _handleCheckinSpeech(text, _match) {
     if (_match(['終わり', 'もういい'])) { this._endCheckin(); return; }
     this._checkinTurn(text);             // ask the model for the next question
   }
   _endCheckin() { this._checkinMode = false; this.scene.setState(STATE.IDLE); this._resetWanderTimer(); }
   ```
5. **(Optional) a model "mode"** — if the turns need the LLM, call `/api/chat` and give it a mode‑specific
   instruction. Add a branch in `functions/api/chat.js` that swaps the system prompt when
   `body.mode === 'checkin'`, e.g. "ask one question at a time; never diagnose; if it sounds serious, advise
   seeing a doctor." Keep safety rules explicit.

## Worked example: a check‑in (問診) flow

Goal: the butler asks about the user's condition one question at a time, stays supportive, and never gives
medical diagnoses.

1. Add `CHECKIN_TRIGGERS`, `this._checkinMode`, the dispatch lines, and the handlers above.
2. In `functions/api/chat.js`, branch on `mode`:
   ```js
   const sys = body.mode === 'checkin'
     ? 'あなたはAI執事。体調を一問ずつ丁寧に伺います。診断・断定はせず、深刻そうなら受診を勧めます。'
     : PERSONA;
   ```
   and send `{ message, mode: 'checkin' }` from `_checkinTurn`.
3. (Optional) add a dedicated video state and clip (see `MEDIA_PROMPTS.md`) and `this.scene.setState(...)`.

That's it — the same five pieces give you search, drawing, a game master, or anything else. Keep each mode
self‑contained and always provide an exit trigger that clears the flag and returns to idle.

## Checklist for any new feature
- [ ] Trigger constant + state flag + dispatch entry (enter & in‑mode routing)
- [ ] Added the flag to the idle/guard expressions
- [ ] Start / per‑turn / exit handlers (exit clears the flag and calls `_resetWanderTimer()`)
- [ ] If it uses the model: a `mode` branch in `chat.js` with clear, safe instructions
- [ ] If it needs visuals: a clip in `public/videos/` and a `scene.setState`
- [ ] No new secrets in client code; no personal data
