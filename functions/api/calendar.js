/**
 * Cloudflare Pages Function — /api/calendar
 *
 * GAS（AINAS_Calendar）→ KV `calendar_today` 保存 → AINAS起動時/チャットで参照。
 * Mac OFF でも動く（KVはクラウド）。
 *
 * POST /api/calendar   Headers: Authorization: Bearer <CF_SYNC_TOKEN>
 *   Body: { value: "予定テキスト" } → KV calendar_today に保存
 * GET  /api/calendar   → { value: "..." }（未設定時は「予定はありません。」）
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const KEY = 'calendar_today';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const kv = env.RET_MEMORY;
  if (!kv) return json(503, { error: 'KVが未設定です' });

  // ── GET: 現在のカレンダーテキストを返す ──
  if (request.method === 'GET') {
    const value = (await kv.get(KEY)) || '予定はありません。';
    return json(200, { value });
  }

  // ── POST: GAS から Bearer 認証で保存 ──
  if (request.method === 'POST') {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.CF_SYNC_TOKEN || token !== env.CF_SYNC_TOKEN) {
      return json(401, { error: 'Unauthorized' });
    }
    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
    const value = (body?.value ?? '').toString();
    await kv.put(KEY, value);
    return json(200, { ok: true, saved: value.length });
  }

  return json(405, { error: 'Method Not Allowed' });
}

const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
