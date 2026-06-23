#!/bin/bash
# ═══════════════════════════════════════════════════
# Ollama ヘルスチェック＋自動再起動スクリプト
# cron: */5 * * * * /bin/bash ~/RET/backend/healthcheck.sh
# ═══════════════════════════════════════════════════

LOG="/tmp/ollama_health.log"

if ! curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] Ollama is down, restarting..." >> "$LOG"
  OLLAMA_ORIGINS="*" /opt/homebrew/bin/ollama serve > /dev/null 2>&1 &
  sleep 3

  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Ollama restarted successfully" >> "$LOG"
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Ollama restart failed" >> "$LOG"
  fi
fi
