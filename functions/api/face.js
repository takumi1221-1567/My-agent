/**
 * Cloudflare Pages Function — /api/face
 * FACE_URL は KV (_config_face_url) または env var から取得
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const kv       = env.RET_MEMORY;
  const faceBase = ((kv ? await kv.get('_config_face_url') : null)
    || env.FACE_URL || '').replace(/\/$/, '');

  if (!faceBase) {
    // 顔認証サーバー未起動時はスキップ（アプリは動く）
    return new Response(JSON.stringify({ error: 'face_server_offline', matched: false }), {
      status: 503,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const url     = new URL(request.url);
  const subpath = url.pathname.replace(/^\/api\/face/, '') || '/';

  let upstream;
  try {
    upstream = await fetch(`${faceBase}/face${subpath}`, {
      method:  request.method,
      headers: { 'Content-Type': 'application/json' },
      body:    request.method !== 'GET' ? request.body : undefined,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `顔認証サーバー接続失敗: ${e.message}`, matched: false }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
