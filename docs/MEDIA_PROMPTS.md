# Character image & video generation — the prompt workflow

The butler's "presence" is just a set of short videos cross‑faded by state. You generate them with an
image/video model (the included prompts were written for **Gemini**). This doc explains the workflow and
what each prompt in [`../prompts/`](../prompts/) is for, so anyone can reproduce the same quality.

## The pipeline

```
1. Reference  →  2. Base image  →  3. Per‑state image‑to‑video clips  →  4. Drop into public/videos/
   (your idea)     (front‑facing)    (idle / talking / outing steps)        (filenames app.js expects)
```

### 1–2. Base character image
Start from any reference and generate a clean, **front‑facing, neutral‑pose** 3D character. This single
image is the anchor every video must stay consistent with.
- Prompt: [`prompts/ベース画像生成プロンプト.md`](../prompts/ベース画像生成プロンプト.md)
- Key idea: symmetrical, looking straight at camera, standing upright, consistent colors/details.

### 3. Per‑state video clips (image‑to‑video)
Feed the **base image** to the video model with one motion prompt per state. The golden rule in every
prompt: **change only the described motion — keep appearance, clothing, hair, colors, lighting, camera,
and background identical.** That visual consistency is what makes the cross‑fades seamless.

There's also a **meta‑prompt** that generates new motion prompts for you:
[`prompts/動画プロンプト作成プロンプト.md`](../prompts/動画プロンプト作成プロンプト.md) — it asks what action you
want, then writes an English image‑to‑video prompt with the "don't change anything else" constraint baked in.

### 4. Install the clips
Save each `.mp4` into `public/videos/` using the names `app.js` references (search `OUTING_SEQUENCE`,
`RETURN_SEQUENCE`, and the idle/talking state clips). Re‑encode to 480p + faststart for quick start and to
avoid black frames between clips.

## Prompt index (what each file produces)

| State in the app | Prompt file |
|---|---|
| Base character (anchor) | `ベース画像生成プロンプト.md` |
| Talking (mouth moves) | `会話状態プロンプト.md` |
| Idle — waiting | `待機状態プロンプト.md` |
| Idle — reading a magazine | `雑誌読んでいる待機動画プロンプト.md` |
| Idle — looking bored | `退屈そうな動画プロンプト.md` |
| Idle — stretching | `背伸びしている動画プロンプト.md` |
| Idle — looking busy | `忙しそうにしている動画プロンプト.md` |
| Outing — leaving for the car | `外出動画プロンプト.md` |
| Outing — getting in the car | `車に乗る動画プロンプト.md` |
| Outing — starting/driving off | `発進する動画プロンプト.md` |
| Outing — passenger‑seat POV (drive) | `助手席視点の運転動画プロンプト.md` |
| Outing — getting out | `降車する動画プロンプト.md` |
| Return — coming home | `帰宅する動画プロンプト.md` |
| (meta) generate a new motion prompt | `動画プロンプト作成プロンプト.md` |

## Tips for consistent results
- Always start from the **same base image**; never let the model redesign the character.
- One motion per clip; keep clips short (1–3 s). Loop idle clips; play sequence clips once and transition.
- If a clip drifts (different face/colors), regenerate with a stronger "do not change …" clause.
- Match the app's expected filenames, or update the constants in `public/js/app.js`.
