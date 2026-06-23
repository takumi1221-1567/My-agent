/**
 * Cloudflare Pages Function — GET /api/vault/random
 *
 * Vault(D1 vault_chunks) と memories からランダムに1件返す。
 * アイドリング独り言の「話題の種」に使い、毎回同じ話題（例: 五右衛門）に
 * 偏るのを防ぐ。RAGの関連度順ではなく純粋ランダムなので多様性が出る。
 *
 * → { topic: "チャンク本文", source: "path" }
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET')     return json(405, { error: 'Method Not Allowed' });

  const db = env.DB;
  if (!db) return json(200, { topic: '', source: '' });

  try {
    // vault_chunks と memories を統合してランダム1件。短すぎるチャンクは避ける。
    const tryQueries = [
      `SELECT path AS source, chunk AS text FROM vault_chunks WHERE length(chunk) >= 30 ORDER BY RANDOM() LIMIT 1`,
      `SELECT ('Memory/' || keyword) AS source, content AS text FROM memories WHERE length(content) >= 10 ORDER BY RANDOM() LIMIT 1`,
    ];
    // どちらかをランダムに優先（vault寄り 70%）
    const order = Math.random() < 0.7 ? [0, 1] : [1, 0];
    for (const i of order) {
      try {
        const row = await db.prepare(tryQueries[i]).first();
        if (row && row.text) {
          return json(200, { topic: row.text.toString().slice(0, 400), source: (row.source || '').toString() });
        }
      } catch { /* 次へ */ }
    }
  } catch { /* 下で空返却 */ }

  return json(200, { topic: '', source: '' });
}

const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
