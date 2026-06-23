/**
 * Cloudflare Pages Function — /api/daily
 *
 * Obsidian の Daily ノート（その日の日報）への追記キュー。
 * CF→Mac は直接届かないため、ここに溜めて AINAS(Mac) が pull して Daily に追記する。
 *
 * POST /api/daily        Body: { date?: "YYYY-MM-DD", id?: string, title?: string, content: string }
 *   → KV `daily_append:<date>_<id>` に保存（追記待ち）
 * GET  /api/daily?action=pending   Headers: x-sync-token
 *   → 追記待ち一覧 [{ date, id, title, content }]（AINAS が Daily へ追記）
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sync-token',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const kv = env.RET_MEMORY;

  // ── GET ?action=pending: AINAS が追記待ちを取得 ──
  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'pending') return json(400, { error: 'unknown action' });
    const token = request.headers.get('x-sync-token') || '';
    if (!env.CF_SYNC_TOKEN || token !== env.CF_SYNC_TOKEN) return json(401, { error: 'Unauthorized' });
    if (!kv) return json(200, { items: [] });
    const items = [];
    try {
      const list = await kv.list({ prefix: 'daily_append:', limit: 100 });
      for (const k of (list.keys || [])) {
        const v = await kv.get(k.name);
        if (v) { try { items.push(JSON.parse(v)); } catch { /* skip */ } }
      }
    } catch { /* 空 */ }
    return json(200, { items });
  }

  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  if (!kv) return json(503, { error: 'KVが未設定です' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const content = (body?.content ?? '').toString().trim();
  if (!content) return json(400, { error: 'content required' });
  const date  = (body?.date ?? new Date().toISOString().slice(0, 10)).toString();
  const id    = (body?.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).toString();
  const title = (body?.title ?? '').toString();

  await kv.put(`daily_append:${date}_${id}`, JSON.stringify({ date, id, title, content }));
  return json(200, { ok: true, date, id });
}

const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
