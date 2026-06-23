/**
 * Cloudflare Pages Function — /api/memory
 * 「覚えて」で確定事実を保存／読み出し（会話の (A) 確定記憶）。
 *   GET    — 最新の記憶一覧（KV）
 *   POST   — 記憶を保存（KV ＋ 任意で D1 `memories` テーブル）
 *   DELETE — 全削除
 * バインディング: env.MEMORY = KV namespace。env.DB = D1（任意・あれば併用保存）。
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const okRes  = d     => new Response(JSON.stringify(d),            { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const errRes = (s, m) => new Response(JSON.stringify({ error: m }), { status: s,   headers: { ...CORS, 'Content-Type': 'application/json' } });

const KV_INDEX_KEY = 'memory_index';
const MAX_MEMORIES = 20;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const kv = env.MEMORY;
  if (!kv) return errRes(503, 'KV(MEMORY) が未設定です');

  if (request.method === 'GET') {
    const index    = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    const memories = [];
    for (const id of index.slice(0, MAX_MEMORIES)) {
      const val = await kv.get(`memory:${id}`);
      if (val) memories.push(JSON.parse(val));
    }
    return okRes({ memories });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return errRes(400, 'Invalid JSON'); }
    const keyword = (body?.keyword ?? '').toString().trim();
    if (!keyword) return errRes(400, '"keyword" is required');

    const id      = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const savedAt = new Date().toISOString();
    const item    = { id, keyword, context: (body?.context || keyword), saved_at: savedAt };

    // KV に保存（index 先頭に追加、上限超過は切り詰め）
    await kv.put(`memory:${id}`, JSON.stringify(item));
    const index = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    index.unshift(id);
    if (index.length > MAX_MEMORIES) index.splice(MAX_MEMORIES);
    await kv.put(KV_INDEX_KEY, JSON.stringify(index));

    // D1 があれば併用保存（任意）
    if (env.DB) {
      try {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO memories (id, keyword, content, saved_at) VALUES (?, ?, ?, ?)'
        ).bind(id, keyword, item.context, savedAt).run();
      } catch { /* memories テーブルが無くても続行 */ }
    }
    return okRes({ saved: true, id });
  }

  if (request.method === 'DELETE') {
    const index = JSON.parse((await kv.get(KV_INDEX_KEY)) || '[]');
    for (const id of index) await kv.delete(`memory:${id}`);
    await kv.delete(KV_INDEX_KEY);
    if (env.DB) { try { await env.DB.prepare('DELETE FROM memories').run(); } catch { /* ignore */ } }
    return okRes({ deleted: index.length });
  }

  return errRes(405, 'Method Not Allowed');
}
