#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  RET — 全自動起動スクリプト                              ║
# ║  Ollama + 顔認証 + Tunnel URL自動登録 + デプロイ         ║
# ╚══════════════════════════════════════════════════════════╝
set -e

MODEL="${1:-llama3}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
KV_ID="<your-kv-namespace-id>"
PROJECT_NAME="your-project"
AWS_MEMORY_URL="https://mgxzxd49sk.execute-api.ap-northeast-1.amazonaws.com/prod"

LOG_OLLAMA="/tmp/ret_ollama_tunnel.log"
LOG_FACE="/tmp/ret_face_tunnel.log"

cleanup() {
  echo ""
  echo "▶ 停止中..."
  kill "$OLLAMA_PID" "$FACE_PID" "$TUNNEL_OLLAMA_PID" "$TUNNEL_FACE_PID" 2>/dev/null
  rm -f "$LOG_OLLAMA" "$LOG_FACE"
  exit 0
}
trap cleanup INT TERM

# ─── 待機ヘルパー ────────────────────────────────────────────
wait_for_url() {
  local log="$1"
  local max=60
  for i in $(seq 1 $max); do
    local url
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1)
    if [[ -n "$url" ]]; then echo "$url"; return 0; fi
    sleep 1
  done
  echo ""
}

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║            RET ローカルサーバー起動中                ║"
echo "╚══════════════════════════════════════════════════════╝"

# ─── 1. Ollama ───────────────────────────────────────────────
echo ""
echo "▶ [1/4] Ollama 起動..."
OLLAMA_ORIGINS="*" ollama serve > /dev/null 2>&1 &
OLLAMA_PID=$!
sleep 2

if ! ollama list 2>/dev/null | grep -q "^${MODEL}"; then
  echo "  モデル「${MODEL}」をダウンロード中（初回のみ）..."
  ollama pull "${MODEL}"
fi
echo "  ✅ Ollama 起動完了"

# ─── 2. 顔認証サーバー ──────────────────────────────────────
echo ""
echo "▶ [2/4] 顔認証サーバー起動..."
pip3 install -q -r "${SCRIPT_DIR}/requirements_face.txt" 2>/dev/null || true
python3 "${SCRIPT_DIR}/face_server.py" > /dev/null 2>&1 &
FACE_PID=$!
sleep 3
echo "  ✅ 顔認証サーバー起動完了"

# ─── 3. Cloudflare Tunnel × 2 ───────────────────────────────
echo ""
echo "▶ [3/4] Cloudflare Tunnel 接続中..."
rm -f "$LOG_OLLAMA" "$LOG_FACE"

cloudflared tunnel --url http://localhost:11434 --no-autoupdate > "$LOG_OLLAMA" 2>&1 &
TUNNEL_OLLAMA_PID=$!

cloudflared tunnel --url http://localhost:8001  --no-autoupdate > "$LOG_FACE" 2>&1 &
TUNNEL_FACE_PID=$!

echo "  URLを取得中..."
OLLAMA_URL=$(wait_for_url "$LOG_OLLAMA")
FACE_URL=$(wait_for_url "$LOG_FACE")

if [[ -z "$OLLAMA_URL" || -z "$FACE_URL" ]]; then
  echo "  ⚠️  Tunnel URL の取得に失敗しました。cloudflared が正常に動作していか確認してください。"
  cleanup
fi

echo "  ✅ Tunnel 接続完了"
echo "     OLLAMA → ${OLLAMA_URL}"
echo "     FACE   → ${FACE_URL}"

# ─── 4. KV に URL を書き込み → デプロイ ─────────────────────
echo ""
echo "▶ [4/4] Cloudflare に設定を反映中..."

cd "${PROJECT_DIR}"

# KV にURLを保存（Pages Function が読み取る）
npx wrangler kv key put \
  --namespace-id="${KV_ID}" \
  "_config_ollama_url" "${OLLAMA_URL}" \
  --remote > /dev/null 2>&1

npx wrangler kv key put \
  --namespace-id="${KV_ID}" \
  "_config_face_url" "${FACE_URL}" \
  --remote > /dev/null 2>&1

npx wrangler kv key put \
  --namespace-id="${KV_ID}" \
  "_config_ollama_model" "${MODEL}" \
  --remote > /dev/null 2>&1

npx wrangler kv key put \
  --namespace-id="${KV_ID}" \
  "_config_memory_url" "${AWS_MEMORY_URL}" \
  --remote > /dev/null 2>&1

# デプロイ
npx wrangler pages deploy public \
  --project-name="${PROJECT_NAME}" \
  --commit-message="auto: tunnel URL更新 $(date '+%Y-%m-%d %H:%M')" \
  > /dev/null 2>&1

echo "  ✅ デプロイ完了"

# ─── 完了 ────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ RET 起動完了！                                   ║"
echo "║                                                      ║"
echo "║  🌐 https://your-project.pages.dev                            ║"
echo "║                                                      ║"
echo "║  このウィンドウを開けたままにしてください。           ║"
echo "║  Ctrl+C で停止します。                               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# サーバーが動き続ける限り待機
wait "$OLLAMA_PID" "$FACE_PID"
