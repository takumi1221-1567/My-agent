/**
 * Cloudflare Pages Function — /api/memory
 *
 * GET    /api/memory  — 記憶一覧（KVから最新10件）
 * POST   /api/memory  — 記憶保存: KV + D1 + AINAS（Obsidian Memory/）の3箇所に保存
 * DELETE /api/memory  — KV + D1 の記憶を全削除
 *
 * KV設定値:
 *   _config_ainas_url  — AINASのベースURL（例: http://100.115.21.32:8000）
 *                        未設定の場合は KV + D1 のみに保存
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const KV_INDEX_KEY = 'memory_index';
const MAX_MEMORIES = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const kv = env.RET_MEMORY;
  if (!kv) return errRes(503, 'KVが未設定です');

  // ── GET: KVから記憶一覧 ────────────────────────────────
  if (request.method === 'GET') {
    const index    = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    const memories = [];
    for (const id of index.slice(0, MAX_MEMORIES)) {
      const val = await kv.get(`memory:${id}`);
      if (val) memories.push(JSON.parse(val));
    }
    return okRes({ memories });
  }

  // ── POST: KV + D1 + AINAS に保存 ─────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return errRes(400, 'Invalid JSON'); }

    const { keyword, context } = body;
    if (!keyword) return errRes(400, '"keyword" is required');

    const id      = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const savedAt = new Date().toISOString();
    const item    = { id, keyword, context: context || keyword, saved_at: savedAt };

    // 1) KV に保存
    await kv.put(`memory:${id}`, JSON.stringify(item));
    const index = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    index.unshift(id);
    if (index.length > MAX_MEMORIES) index.splice(MAX_MEMORIES);
    await kv.put(KV_INDEX_KEY, JSON.stringify(index));

    // 2) D1 に保存（Mac OFF 時の RAG で参照できるよう）
    const db = env.DB;
    if (db) {
      try {
        const content = context || keyword;
        await db.prepare(
          'INSERT OR REPLACE INTO memories (id, keyword, content, saved_at) VALUES (?, ?, ?, ?)'
        ).bind(id, keyword, content, savedAt).run();
      } catch { /* D1 が使えなくても続行 */ }
    }

    // 3) AINAS（Mac起動中）にも転送 → Obsidian Memory/ に保存
    const ainasBase = ((await kv.get('_config_ainas_url')) || '').replace(/\/$/, '');
    let ainasResult = null;
    if (ainasBase) {
      const date     = savedAt.slice(0, 10).replace(/-/g, '');
      const slug     = keyword.slice(0, 20).replace(/[/\\:*?"<>|]/g, '_');
      const filename = `${date}_${slug}.md`;
      const content  = [
          `# ${keyword}`,
          '',
          '## 確定事実（変更禁止）',
          keyword,
          '',
          '## メタデータ',
          `- 保存日時: ${savedAt}`,
          '- 信頼度: ユーザー直接入力',
          '- ソース: 音声入力「覚えて」コマンド',
        ].join('\n');
      try {
        const res = await fetch(`${ainasBase}/api/memory/save`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ filename, content }),
          signal:  AbortSignal.timeout(5000),
        });
        ainasResult = res.ok ? 'saved' : `AINAS error ${res.status}`;
      } catch (e) {
        ainasResult = `AINAS unreachable: ${e.message}`;
      }
    }

    return okRes({ saved: true, id, ainas: ainasResult });
  }

  // ── DELETE: KV + D1 全削除 ────────────────────────────
  if (request.method === 'DELETE') {
    const index = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    for (const id of index) await kv.delete(`memory:${id}`);
    await kv.delete(KV_INDEX_KEY);

    const db = env.DB;
    if (db) {
      try { await db.prepare('DELETE FROM memories').run(); } catch { /* ignore */ }
    }

    return okRes({ deleted: index.length });
  }

  return errRes(405, 'Method Not Allowed');
}

const okRes  = d     => new Response(JSON.stringify(d),              { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const errRes = (s,m) => new Response(JSON.stringify({ error: m }),   { status: s,   headers: { ...CORS, 'Content-Type': 'application/json' } });
