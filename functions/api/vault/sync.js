/**
 * Cloudflare Pages Function — /api/vault/sync
 *
 * AINAS（Mac側）から Obsidian vault の内容を D1 に同期するエンドポイント。
 * Mac が起動中のみ呼ばれる。Mac が OFF の間は D1 の内容を RAG として利用する。
 *
 * POST /api/vault/sync
 *   Headers: x-sync-token: <CF_SYNC_TOKEN>
 *   Body: { path: string, chunks: string[] }
 *   → D1 の vault_chunks を更新
 *
 * DELETE /api/vault/sync?path=...
 *   Headers: x-sync-token: <CF_SYNC_TOKEN>
 *   → 指定パスのチャンクを削除
 *
 * POST /api/vault/sync?action=clear
 *   → 全チャンクを削除（全件再同期の前処理）
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sync-token',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // トークン認証
  const token = request.headers.get('x-sync-token') || '';
  if (!env.CF_SYNC_TOKEN || token !== env.CF_SYNC_TOKEN) {
    return err(401, 'Unauthorized');
  }

  const db = env.DB;
  if (!db) return err(503, 'D1 not configured');

  const url    = new URL(request.url);
  const action = url.searchParams.get('action');

  // ── DELETE: 指定パスのチャンクを削除 ─────────────────────
  if (request.method === 'DELETE') {
    const path = url.searchParams.get('path');
    if (!path) return err(400, '"path" query parameter required');
    await db.prepare('DELETE FROM vault_chunks WHERE path = ?').bind(path).run();
    return ok({ deleted: path });
  }

  if (request.method !== 'POST') return err(405, 'Method Not Allowed');

  // ── POST ?action=clear: 全件削除 ──────────────────────────
  if (action === 'clear') {
    await db.prepare('DELETE FROM vault_chunks').run();
    return ok({ cleared: true });
  }

  // ── POST: ファイル単位でチャンクをupsert ─────────────────
  let body;
  try { body = await request.json(); } catch { return err(400, 'Invalid JSON'); }

  const { path, chunks } = body;
  if (!path || !Array.isArray(chunks)) return err(400, '"path" and "chunks" array required');

  const now = new Date().toISOString();

  // 既存チャンクを削除してから挿入（= upsert）
  await db.prepare('DELETE FROM vault_chunks WHERE path = ?').bind(path).run();

  if (chunks.length > 0) {
    const stmt = db.prepare(
      'INSERT INTO vault_chunks (path, chunk, updated_at) VALUES (?, ?, ?)'
    );
    // D1 batch API でまとめて実行
    const batch = chunks.map(chunk => stmt.bind(path, chunk, now));
    await db.batch(batch);
  }

  return ok({ synced: path, chunks: chunks.length });
}

const ok  = d    => new Response(JSON.stringify(d),              { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
const err = (s,m)=> new Response(JSON.stringify({ error: m }),   { status: s,   headers: { ...CORS, 'Content-Type': 'application/json' } });
