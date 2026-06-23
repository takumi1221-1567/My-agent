/**
 * /api/sync-request — My agentの「インストール」コマンドで同期リクエストのフラグを立てる。
 *   POST → KV `sync_request_ts` に現在時刻(ms)をセット（1回1書き込み）
 *   GET  → { ts } を返す（Mac側の見張り役が読み取り、新しければ再同期を実行）
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const kv = env.MEMORY;
  if (!kv) return json(503, { error: 'KV unavailable' });

  if (request.method === 'POST') {
    await kv.put('sync_request_ts', String(Date.now()));
    return json(200, { ok: true });
  }
  // GET: 現在のリクエスト時刻
  const ts = parseInt((await kv.get('sync_request_ts')) || '0', 10);
  return json(200, { ts });
}
