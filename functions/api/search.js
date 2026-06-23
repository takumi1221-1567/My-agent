/**
 * Cloudflare Pages Function — /api/search   （PHASE D / D-9）
 *
 * パスワード認証付き DuckDuckGo 検索。R-7 の例外として、
 * 「ユーザー明示指示（検索コマンド）＋パスワード認証済み」の場合のみ Web 検索を許可する。
 * 自動・定期検索は行わない（毎回パスワードガードを通過する必要がある）。
 *
 * POST /api/search
 *   Body: { q: "検索ワード", pw: "<トークン>" }
 *     → pw が正しければ DuckDuckGo Instant Answer API で検索し結果を返す
 *     → DDGが空（通常の検索語では頻繁）なら Wikipedia(日本語) の導入文で補完
 *     → { q, summary, results: [...], source }
 *
 * POST /api/search   （検索結果の保存 / D-7）
 *   Body: { action: "save", q, content, pw: "<トークン>" }
 *     → KV に保存（Mac OFF でも残る）＋ AINAS 起動中なら Obsidian raw/ にも書き込み
 *     → { saved: true, file }
 *
 * 設計方針:
 *   - トークンは環境シークレット env.SEARCH_TOKEN で照合（コードに平文を置かない / R-6順守）。
 *     クライアントはユーザーが初回入力した値を localStorage から送る（公開JSに値を載せない）。
 *   - 保存は memory.js と同じく AINAS `/api/memory/save`（folder=raw）へ転送（Mac起動中のみ）。
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-sync-token',
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // ── GET ?action=pending: AINAS(Mac起動中)がスマホ保存の検索結果を取り込む ──
  // x-sync-token 認証。KV `search_raw:*` を一覧で返し、AINAS が Obsidian raw/ に書き込む。
  if (request.method === 'GET') {
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'pending') return json(400, { error: 'unknown action' });
    const token = request.headers.get('x-sync-token') || '';
    if (!env.CF_SYNC_TOKEN || token !== env.CF_SYNC_TOKEN) return json(401, { error: 'Unauthorized' });
    const kv = env.RET_MEMORY;
    if (!kv) return json(200, { items: [] });
    const items = [];
    try {
      const list = await kv.list({ prefix: 'search_raw:', limit: 100 });
      for (const k of (list.keys || [])) {
        const content = await kv.get(k.name);
        if (content) items.push({ file: k.name.replace(/^search_raw:/, ''), content });
      }
    } catch { /* 空で返す */ }
    return json(200, { items });
  }

  if (request.method !== 'POST')    return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  // ── トークンガード（D-9）: 未認証では一切検索・保存させない ──
  // 秘密はサーバー側の env.SEARCH_TOKEN のみが保持（公開JSには載らない / R-6順守）。
  const pw = (body?.pw ?? '').toString();
  if (!env.SEARCH_TOKEN || pw !== env.SEARCH_TOKEN) return json(401, { error: 'パスワードが違います' });

  // ── 保存（D-7）─────────────────────────────────────────
  if (body?.action === 'save') {
    const q       = (body?.q ?? '').toString().trim() || '検索';
    const content = (body?.content ?? '').toString();
    const date    = new Date().toISOString().slice(0, 10);                 // YYYY-MM-DD
    const slug    = q.slice(0, 30).replace(/[/\\:*?"<>|]/g, '_');
    const file    = `${date}_${slug}.md`;
    const md      = [
      `# 検索結果: ${q}`,
      '',
      `- 検索日: ${date}`,
      '- ソース: DuckDuckGo（パスワード認証済みの明示検索 / R-7例外）',
      '',
      content,
    ].join('\n');

    // 1) KV に保存（クラウド・Mac OFF でも残る）
    const kv = env.RET_MEMORY;
    if (kv) {
      try { await kv.put(`search_raw:${file}`, md); } catch { /* 続行 */ }
    }

    // 2) AINAS（Mac起動中）に転送 → Obsidian raw/ に書き込み
    let ainasResult = null;
    const ainasBase = ((kv && await kv.get('_config_ainas_url')) || '').replace(/\/$/, '');
    if (ainasBase) {
      try {
        const res = await fetch(`${ainasBase}/api/memory/save`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ folder: 'raw', filename: file, content: md }),
          signal:  AbortSignal.timeout(5000),
        });
        ainasResult = res.ok ? 'saved' : `AINAS error ${res.status}`;
      } catch (e) {
        ainasResult = `AINAS unreachable: ${e.message}`;
      }
    }

    return json(200, { saved: true, file: `raw/${file}`, ainas: ainasResult });
  }

  // ── 検索（D-4）─────────────────────────────────────────
  const q = (body?.q ?? '').toString().trim();
  if (!q) return json(400, { error: '検索ワードが空です' });

  const results = [];
  let source = '';

  // 1) DuckDuckGo Instant Answer API（百科事典的な即答）
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}` +
                   `&format=json&no_html=1&skip_disambig=1&kl=jp-jp`;
    const res = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'RET-AINAS/1.0 (search)' },
      signal:  AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const d = await res.json();
      const abstract = (d.AbstractText || d.Answer || d.Definition || '').toString().trim();
      if (abstract) { results.push(abstract); source = (d.AbstractURL || '').toString(); }
      const topics = Array.isArray(d.RelatedTopics) ? d.RelatedTopics : [];
      for (const t of topics) {
        if (results.length >= 4) break;
        const text = (t && t.Text) ? t.Text.toString().trim() : '';
        if (text) results.push(text);
      }
    }
  } catch { /* フォールバックへ */ }

  // 2) DuckDuckGo が空なら Wikipedia（日本語）で調べる
  //    DDG Instant Answer は通常の検索語では空が多いため、確実に動く Wikipedia API を補完に使う。
  if (results.length === 0) {
    try {
      const wiki = await searchWikipedia(q);
      if (wiki) {
        results.push(wiki.extract);
        source = wiki.url;
      }
    } catch { /* 何も得られなければ下で「見つからない」 */ }
  }

  const summary = results.length
    ? results.join(' / ')
    : `「${q}」について、該当する情報が見つかりませんでした。別の言葉でお試しください。`;

  return json(200, { q, summary, results, source });
}

// Wikipedia（日本語）で検索語に最も近い記事の導入文を取得する。
async function searchWikipedia(q) {
  const base = 'https://ja.wikipedia.org/w/api.php';
  const ua   = { 'User-Agent': 'RET-AINAS/1.0 (search)' };

  // 検索でタイトルを得る
  const sUrl = `${base}?action=query&format=json&list=search&srlimit=1&srsearch=${encodeURIComponent(q)}`;
  const sRes = await fetch(sUrl, { headers: ua, signal: AbortSignal.timeout(8000) });
  if (!sRes.ok) return null;
  const sData = await sRes.json();
  const hit   = sData?.query?.search?.[0];
  if (!hit?.title) return null;

  // 記事の導入文（プレーンテキスト）を取得
  const eUrl = `${base}?action=query&format=json&prop=extracts&exintro=1&explaintext=1` +
               `&redirects=1&titles=${encodeURIComponent(hit.title)}`;
  const eRes = await fetch(eUrl, { headers: ua, signal: AbortSignal.timeout(8000) });
  if (!eRes.ok) return null;
  const eData = await eRes.json();
  const page  = Object.values(eData?.query?.pages || {})[0];
  let extract = (page?.extract || '').toString().trim().replace(/\s+/g, ' ');
  if (!extract) return null;
  if (extract.length > 280) extract = extract.slice(0, 280) + '…';

  return {
    extract: `${hit.title}: ${extract}`,
    url:     `https://ja.wikipedia.org/wiki/${encodeURIComponent(hit.title)}`,
  };
}

const json = (s, o) => new Response(JSON.stringify(o),
  { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
