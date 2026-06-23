-- Cloudflare D1: my-agent-vault schema

-- Vault chunks: Obsidian ノートを分割して格納
CREATE TABLE IF NOT EXISTS vault_chunks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL,
  chunk      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- FTS5 全文検索テーブル（日本語Unicode対応）
CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5(
  path   UNINDEXED,
  chunk,
  content     = 'vault_chunks',
  content_rowid = 'id',
  tokenize    = "unicode61"
);

-- vault_chunks の変更を vault_fts に自動反映するトリガー
CREATE TRIGGER IF NOT EXISTS vault_ai AFTER INSERT ON vault_chunks BEGIN
  INSERT INTO vault_fts(rowid, path, chunk) VALUES (new.id, new.path, new.chunk);
END;

CREATE TRIGGER IF NOT EXISTS vault_au AFTER UPDATE ON vault_chunks BEGIN
  INSERT INTO vault_fts(vault_fts, rowid, path, chunk)
    VALUES ('delete', old.id, old.path, old.chunk);
  INSERT INTO vault_fts(rowid, path, chunk) VALUES (new.id, new.path, new.chunk);
END;

CREATE TRIGGER IF NOT EXISTS vault_ad AFTER DELETE ON vault_chunks BEGIN
  INSERT INTO vault_fts(vault_fts, rowid, path, chunk)
    VALUES ('delete', old.id, old.path, old.chunk);
END;

-- Memories: 「覚えて」コマンドで保存した記憶（KVのバックアップ）
CREATE TABLE IF NOT EXISTS memories (
  id       TEXT PRIMARY KEY,
  keyword  TEXT NOT NULL,
  content  TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
