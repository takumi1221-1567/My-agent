/**
 * Cloudflare Pages Function — GET /api/vault/status
 *
 * Obsidian→D1 同期の最終時刻と件数を返す（起動時の「最新同期は◯月◯日です」表示用）。
 * D1 vault_chunks.updated_at の最大値＝直近の同期時刻。
 *
 * → { last_synced: ISO文字列|null, count: 件数 }
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const db = env.DB;
  if (!db) return json(200, { last_synced: null, count: 0 });
  try {
    const row = await db.prepare(
      'SELECT MAX(updated_at) AS last, COUNT(*) AS n FROM vault_chunks'
    ).first();
    return json(200, { last_synced: row?.last || null, count: row?.n || 0 });
  } catch {
    return json(200, { last_synced: null, count: 0 });
  }
}

const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
