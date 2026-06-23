---
name: add-agent-sequence
description: Add a new self-contained behavior (a "mode"/sequence) to a voice agent's client state machine — trigger words, a state flag, dispatch routing, start/turn/exit handlers, and an optional model mode. Use when extending a conversational agent with a new flow.
---

# Adding a sequence/mode to a voice agent

A consistent 5-piece pattern for new behaviors (search, check-in, a game, a guided flow…). All client-side.

## The 5 pieces
1. **Trigger words** — `const X_TRIGGERS = ['…'];` phrases that start the mode.
2. **State flag** — `this._xMode = false;` in the constructor.
3. **Dispatch** in the speech handler:
   - in-mode routing first: `if (this._xMode) { this._handleXSpeech(text, _match); return; }`
   - entry trigger: `if (_match(X_TRIGGERS)) { this._cancelLocalAI(); this._startX(text); return; }`
   - add `this._xMode` to the idle/guard expressions so wander/idle pauses during the mode.
4. **Handlers** — `_startX` (set flag, set scene, speak intro), `_handleXSpeech` (per turn; recognize an exit
   trigger), `_endX` (clear flag, return to IDLE, `_resetWanderTimer()`).
5. **(Optional) model mode** — send `{ message, mode: 'x' }` and branch the system prompt in the chat
   function for that mode (with explicit safety rules where relevant).

## Rules
- Always provide an **exit trigger** that clears the flag and returns to idle — otherwise the agent gets stuck.
- Keep each mode **self-contained**; don't entangle it with other modes' state.
- Add the flag to **every** guard/idle expression, or background timers will fight your sequence.
- If the mode shows a distinct animation, add a clip + `scene.setState(...)`.
- Never put secrets in client code; the browser only talks to your own `/api/*`.

## Test
Trigger the mode by voice/text, run a couple of turns, hit the exit trigger, confirm it returns to idle and
the mic works again.
