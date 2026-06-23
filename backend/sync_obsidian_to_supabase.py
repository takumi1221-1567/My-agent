#!/usr/bin/env python3
"""
Obsidian(D1ミラー) → Supabase 同期スクリプト

My agent の D1 `vault_chunks`（= Obsidian Vault のミラー）を読み出し、
Supabase の public.obsidian_knowledge テーブルへ全件コピー（洗い替え）する。
AI chat team in your Discord 等が Obsidian の知識を Supabase 側からも参照できるようにするための補助同期。

前提:
  - `npx wrangler` が使え、My agent の D1 (my-agent-vault) にアクセスできること
  - Supabase の obsidian_knowledge テーブルが作成済み（RLS有効）であること

環境変数:
  SUPABASE_URL          例: https://xxiwvyvgrhnvbsfrkwla.supabase.co
  SUPABASE_SERVICE_KEY  service_role キー（RLSをバイパスして書き込むため必須）

使い方:
  cd ~/My-agent
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 backend/sync_obsidian_to_supabase.py
"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
TABLE        = "obsidian_knowledge"
BATCH        = 50


def fetch_chunks_from_d1() -> list[dict]:
    """My agent の D1 vault_chunks を wrangler 経由で取得する。"""
    out = subprocess.check_output(
        ["npx", "wrangler", "d1", "execute", "my-agent-vault", "--remote", "--json",
         "--command", "SELECT path, chunk FROM vault_chunks"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    data = json.loads(out)
    rows = data[0]["results"]
    return [{"path": r["path"], "content": r["chunk"]} for r in rows if r.get("chunk")]


def _req(method: str, path: str, body: bytes | None = None) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30):
        pass


def main() -> int:
    if not SUPABASE_URL or not SERVICE_KEY:
        print("SUPABASE_URL と SUPABASE_SERVICE_KEY を環境変数で指定してください。", file=sys.stderr)
        return 1

    chunks = fetch_chunks_from_d1()
    print(f"D1から取得: {len(chunks)} チャンク")

    # 洗い替え: 全削除してから一括挿入（D1ミラーを正とする）
    _req("DELETE", f"{TABLE}?id=gt.0")
    print("既存行を削除しました")

    inserted = 0
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        _req("POST", TABLE, json.dumps(batch).encode("utf-8"))
        inserted += len(batch)
    print(f"投入完了: {inserted} 行 → {TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
