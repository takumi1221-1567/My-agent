# My agent — personal AI butler「あいなす」

音声で対話するAI執事「あいなす」を中核に、**キャラクター動画演出・顔/パスワード認証・Obsidianナレッジ参照（RAG）・Web検索・カレンダー連携**までを統合した、**スマートフォン最優先（PWA）** のパーソナルAIアシスタント。

> **ポートフォリオ作品。** 「1体のAIエージェントを、記憶・知識・演出・認証まで含めて作り切る」方法を示します。
> 複数のエージェントを **チーム化して Discord で会議させる** 姉妹プロジェクト
> [AI chat team in your Discord](https://github.com/takumi1221-1567/AI-chat-team-in-your-Discord) と対になります。

---

## 特徴

- 🎙 **音声で対話するAI執事** — 話しかけると、Obsidianの知識と記憶を根拠に丁寧に答える（事実の捏造を禁止）。
- 🎬 **実在感のあるキャラクター演出** — 待機/歩行/会話/外出ドライブ等を実写風動画のクロスフェードで表現（黒画面ゼロ）。
- 🧠 **第二の脳（Obsidian）** — ノートをRAGの情報源に。「覚えて」で確定事実を記憶。
- ☁️ **スマホ最優先のクラウド設計** — ローカルAI（Mac）が無くても、Cloudflareだけで会話・知識参照が完結。在ればより高機能。
- 🔐 **顔認証＋固定パスワードのフォールバック認証**（平文パスワードは保存しない）。
- 🔎 **パスワード認証付きWeb検索**（DuckDuckGo＋Wikipedia補完）と結果のObsidian保存。

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| 📄 [SPECIFICATION.md](SPECIFICATION.md) | システム構成・技術スタック・主要機能・API・データフロー・セキュリティ規範・設計判断 |
| 📘 [OPERATION_GUIDE.md](OPERATION_GUIDE.md) | はじめかた・音声コマンド・各シーケンス・FAQ・運用/デプロイ |
| 🧩 [01 システム概要](01%20%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E6%A6%82%E8%A6%81.md) / [02 人格設定](02%20%E4%BA%BA%E6%A0%BC%E8%A8%AD%E5%AE%9A.md) / [03 技術要件](03%20%E6%8A%80%E8%A1%93%E8%A6%81%E4%BB%B6.md) / [05 機能仕様](05%20%E6%A9%9F%E8%83%BD%E4%BB%95%E6%A7%98.md) | 設計・人格・要件・機能の仕様 |
| ⚙️ セットアップ | [OLLAMA_SETUP](OLLAMA_SETUP.md) / [SETUP_CLOUDFLARE_KV](SETUP_CLOUDFLARE_KV.md) / [PRODUCTION_GUIDE](PRODUCTION_GUIDE.md) |

---

## アーキテクチャ（概要）

```
[ スマホ/PC ブラウザ (PWA) ]
        │ HTTPS
        ▼
[ Cloudflare Pages + Functions ]
   ├─ /api/chat     会話（ローカルAI優先 → Workers AI 70B + D1 RAG）
   ├─ /api/memory   記憶（KV + D1）
   ├─ /api/face     顔認証
   ├─ /api/calendar 予定
   ├─ /api/search   Web検索（DuckDuckGo + Wikipedia・パスワード認証）
   ├─ /api/vault/*  Obsidian↔D1 同期・ランダム話題
   ├─ Workers AI    Llama 3.3 70B（ローカルOFF時の会話生成）
   ├─ D1            Obsidianミラー（RAG用全文検索）
   └─ KV            記憶・設定・予定・検索キュー
        ▲ push(変更時) / pull(起動時・120秒)
[ ローカルAI基盤 (Mac / FastAPI + Ollama + Obsidian) ]   ※任意・在ればより高機能
```

詳細は [SPECIFICATION.md](SPECIFICATION.md) を参照。

---

## 技術スタック

- **フロント**: Vanilla JS（ESモジュール）, Web Speech API（音声認識/合成 ja-JP）, HTML5 Video（2枚重ねクロスフェード）, PWA
- **サーバーレス**: Cloudflare Pages Functions / Workers AI（Llama 3.3 70B）/ D1（SQLite）/ KV
- **RAG**: D1全文LIKE検索 + 日本語キーワード抽出（漢字2-gram・カナ→英語類義語展開・パス検索）
- **ローカル基盤（任意）**: FastAPI + Ollama + Chroma + Obsidian
- **外部API（検索のみ・認証付き）**: DuckDuckGo Instant Answer / Wikipedia

---

## デプロイ

```bash
# Cloudflare Pages へデプロイ（プロジェクト名は自分のものに）
npx wrangler pages deploy public --project-name=my-agent --commit-dirty=true
```

> JS/CSSを変更したら `index.html` の参照クエリ `?v=N` を更新（キャッシュバスト）。
> シークレット（Geminiキー等）は `wrangler pages secret put` で設定（リポジトリには置かない）。

### ローカル確認
```bash
python3 -m http.server 8080 --directory public
```
※ `/api/*` は Cloudflare Functions のため、フル動作は本番/`wrangler pages dev` 環境が必要です。

---

## ファイル構成

```
my-agent/
├── public/                # PWA（UI・キャラクター動画演出）
│   ├── index.html
│   ├── css/ , js/         # app.js（状態機械/各シーケンス）, voice, scene 等
│   └── videos/            # 演出用動画
├── functions/api/         # Cloudflare Pages Functions
│   ├── chat.js memory.js face.js calendar.js search.js
│   └── vault/             # Obsidian↔D1 同期
├── backend/               # ローカル基盤スクリプト（任意）
├── SPECIFICATION.md       # 仕様書
├── OPERATION_GUIDE.md     # 操作説明書
├── schema.sql             # D1 スキーマ
└── wrangler.toml
```

---

## 使い方（クイック）

| 言葉 | 動作 |
|---|---|
| （自由な質問・雑談） | あいなすが回答（知識・記憶を参照） |
| 「〇〇を覚えて」 | 確定事実として記憶 |
| 「クリア」 | 取扱説明を表示 |
| 「外出」／「もういいよ」 | 外出ドライブ開始／帰宅 |
| 「検索」 | Web検索（パスワード認証） |

詳しい操作は [OPERATION_GUIDE.md](OPERATION_GUIDE.md) を参照。

---

## License

MIT — see [LICENSE](LICENSE).
