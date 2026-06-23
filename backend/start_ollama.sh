#!/bin/bash
# RET — Ollamaローカルサーバー起動スクリプト
# このスクリプトを起動したままにしておくとAIが使えます

MODEL="${1:-llama3}"

echo "=== RET ローカルAI起動 ==="

# Ollamaサービス起動
echo "▶ Ollama起動中..."
ollama serve &
OLLAMA_PID=$!
sleep 2

# モデルが未ダウンロードなら取得
if ! ollama list | grep -q "^${MODEL}"; then
  echo "▶ モデル「${MODEL}」をダウンロード中（初回のみ数分かかります）..."
  ollama pull "${MODEL}"
fi

echo "✅ Ollama起動完了 (http://localhost:11434)"
echo ""
echo "=== Cloudflare Tunnel 起動 ==="
echo "▶ トンネル開始中..."
echo ""

# トンネル起動（URLが表示されたらCloudflare PagesのOLLAMA_URLに設定する）
cloudflared tunnel --url http://localhost:11434

# 終了時にOllamaも停止
kill $OLLAMA_PID 2>/dev/null
