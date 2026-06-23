/**
 * GET /api/vault-status — 記憶(D1 vault_chunks)の件数と最終更新を返す。
 * 「同期されているか」を可視化するため。
 *   → { count, latest }   latest = 最新の updated_at (ISO・UTC)
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const db = env.DB;
  if (!db) return json(503, { error: 'DB unavailable' });
  try {
    const row = await db.prepare(
      'SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM vault_chunks'
    ).first();
    return json(200, { count: row?.count || 0, latest: row?.latest || null });
  } catch (e) {
    return json(500, { error: e.message });
  }
}
