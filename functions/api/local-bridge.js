/**
 * Cloudflare Pages Function — POST /api/local-bridge
 *
 * Mac側ブリッジ（cloudflared）が現在のトンネルURLを通知する受け口。
 * KV(MEMORY) に local_llm_url / local_llm_ts(秒) を書き、My agent と another local AI app の
 * /api/chat が「最近通知された＝Macが起動中」のときだけローカル推論を使う。
 *
 *   POST { url: "https://xxxx.trycloudflare.com" }
 *   Header: X-Local-Token: <env.LOCAL_LLM_TOKEN>
 *
 * Macがオフ/スリープになると通知が止まり ts が古くなる → 各 /api/chat が自動でクラウドへ。
 */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token',
};
const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const kv = env.MEMORY;
  if (!kv) return json(503, { error: 'KV unavailable' });

  // 認証（プロキシと同じ共有シークレット）
  if (!env.LOCAL_LLM_TOKEN || request.headers.get('x-local-token') !== env.LOCAL_LLM_TOKEN) {
    return json(401, { error: 'unauthorized' });
  }

  if (request.method === 'GET') {
    const url = (await kv.get('local_llm_url')) || '';
    const ts  = parseInt((await kv.get('local_llm_ts')) || '0', 10);
    const fresh = !!url && !!ts && (Date.now() / 1000 - ts) <= 120;
    return json(200, { url, ts, fresh });
  }

  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad json' }); }
  const url = (body?.url || '').toString().trim();
  if (!/^https:\/\/[\w.-]+/.test(url)) return json(400, { error: 'valid url required' });

  await kv.put('local_llm_url', url);
  await kv.put('local_llm_ts', String(Math.floor(Date.now() / 1000)));
  return json(200, { ok: true });
}
