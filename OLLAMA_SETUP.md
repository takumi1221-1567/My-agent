# Ollama + Cloudflare Tunnel セットアップ（完全無料）

> Gemini不使用・ローカルAIのみ・完全無料

---

## 仕組み

```
スマホ/ブラウザ
    ↓
Cloudflare Pages（my-agent）
    ↓  /api/chat
Cloudflare Pages Function
    ↓  OLLAMA_URL（Tunnel経由）
Cloudflare Tunnel（無料）
    ↓
Ollama（あなたのMac）
    ↓
llama3（ローカルLLM）
```

---

## STEP 1 ｜ cloudflared インストール

```bash
brew install cloudflared
cloudflared --version  # cloudflared version x.x.x が出ればOK
```

---

## STEP 2 ｜ Ollamaモデル 初回ダウンロード

```bash
ollama pull llama3
```

> 約4GB。Wi-Fiで実行してください。完了まで数分かかります。

---

## STEP 3 ｜ 起動（毎回AIを使うとき）

```bash
bash ~/My agent/backend/start_ollama.sh
```

しばらく待つと以下のようなURLが表示されます：

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://xxxx-yyyy-zzzz.trycloudflare.com                                                  |
+--------------------------------------------------------------------------------------------+
```

**この `https://xxxx-yyyy-zzzz.trycloudflare.com` をコピーしてください。**

> ⚠️ このURLは起動のたびに変わります

---

## STEP 4 ｜ Cloudflare Pages に環境変数を設定

> **画面：** https://dash.cloudflare.com/

1. **Workers & Pages** → `my-agent` プロジェクトを選択
2. **「設定」** タブ → **「環境変数」**
3. **「本番環境」** → **「変数を追加」**

| 変数名 | 値 |
|--------|-----|
| `OLLAMA_URL` | `https://xxxx-yyyy-zzzz.trycloudflare.com`（STEP 3 でコピーしたURL） |
| `OLLAMA_MODEL` | `llama3` |

4. **「保存」**

---

## STEP 5 ｜ デプロイ

```bash
cd ~/My agent
npx wrangler pages deploy public --project-name=my-agent --commit-message="Ollama連携"
```

---

## STEP 6 ｜ 動作確認

ブラウザでMy agentを開いてマイクボタンをタップ → AI執事が返答すればOK。

---

## 注意事項

| 項目 | 内容 |
|------|------|
| Tunnel URL | 起動のたびに変わるため、毎回Cloudflare Pagesの環境変数を更新する必要あり |
| Macをスリープさせると | Ollamaが止まる → スクリプトを再起動してURLを更新 |
| モデルサイズ | llama3 = 約4GB。ストレージ注意 |
| 無料かどうか | ✅ Ollama無料・cloudflared無料・Cloudflare Pages無料 |

---

## モデルの変更方法

軽量モデルに変えたい場合：

```bash
ollama pull gemma2:2b    # 1.6GB（軽量・日本語弱め）
ollama pull qwen2.5:3b   # 2GB（日本語対応が良好）
ollama pull llama3.2:3b  # 2GB（バランス型）
```

起動時にモデル指定：
```bash
bash ~/My agent/backend/start_ollama.sh qwen2.5:3b
```

Cloudflare PagesのOLLAMA_MODELも同じ値に変更してください。
