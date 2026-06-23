# Character image & video generation prompts

These are the prompts used to generate the butler's character image and the per‑state video clips with an
image/video model (written for **Gemini**). Full workflow: [`../docs/MEDIA_PROMPTS.md`](../docs/MEDIA_PROMPTS.md).

## Workflow in one line
**Base image** (`ベース画像生成プロンプト.md`) → feed it to an **image‑to‑video** model with one motion prompt
per state → save each `.mp4` into `../public/videos/`.

## Files

- `ベース画像生成プロンプト.md` — the front‑facing 3D **base character** (the anchor for every clip).
- `動画プロンプト作成プロンプト.md` — **meta‑prompt**: generates a new motion prompt for any action you want.
- Talking: `会話状態プロンプト.md`
- Idle: `待機状態プロンプト.md`, `雑誌読んでいる待機動画プロンプト.md`, `退屈そうな動画プロンプト.md`,
  `背伸びしている動画プロンプト.md`, `忙しそうにしている動画プロンプト.md`
- Outing: `外出動画プロンプト.md`, `車に乗る動画プロンプト.md`, `発進する動画プロンプト.md`,
  `助手席視点の運転動画プロンプト.md`, `降車する動画プロンプト.md`
- Return: `帰宅する動画プロンプト.md`

## The one rule that matters
Every motion prompt must say: **change only the described motion — keep the character's appearance, clothing,
hair, colors, lighting, camera, and background identical.** That consistency is what makes the cross‑fades
look like one continuous character.
