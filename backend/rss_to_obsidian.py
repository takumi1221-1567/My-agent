#!/usr/bin/env python3
"""
rss_to_obsidian.py — AIニュースRSSを取得し、Ollamaローカルで日本語翻訳・要約して
Obsidian Vault の AIニュース/ に保存する（MacBook起動中・cron定期実行）。

外部翻訳APIは使わない（翻訳は Ollama ローカル）。
依存: feedparser, requests（ローカルAI venv に導入済み）

実行: python3 ~/My agent/backend/rss_to_obsidian.py
cron: 0 7 * * *  python3 ~/My-agent/backend/rss_to_obsidian.py >> /tmp/ai_rss.log 2>&1
"""

import os
import sys
import time
import feedparser
import requests
from datetime import datetime
from pathlib import Path

# === 設定 ===
VAULT_PATH = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/my-agent-vault/AIニュース"
OLLAMA_URL   = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.environ.get("RSS_MODEL", "gemma2:2b")   # 速度優先。品質重視なら llama3
PER_FEED     = int(os.environ.get("RSS_PER_FEED", "3"))   # 各ソース最新N件

RSS_FEEDS = [
    ("HuggingFace Blog",      "https://huggingface.co/blog/feed.xml"),
    ("MIT Technology Review", "https://www.technologyreview.com/feed/"),
    ("TechCrunch AI",         "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ("The Verge AI",          "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml"),
    ("Google DeepMind",       "https://deepmind.google/blog/rss.xml"),
]


def translate_with_ollama(text: str) -> str:
    """Ollamaで日本語翻訳・3〜5文要約（ローカル・外部API不使用）"""
    if not text.strip():
        return "（本文なし）"
    prompt = (
        "以下の英語テキストを日本語に翻訳し、3〜5文で要約してください。"
        "翻訳・要約のみ出力し、前置きは不要です。\n\n" + text[:2000]
    )
    try:
        res = requests.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=120,
        )
        res.raise_for_status()
        return res.json().get("response", "翻訳失敗").strip()
    except Exception as e:
        return f"翻訳エラー: {e}"


def entry_to_markdown(entry, source_name: str, translated: str) -> str:
    title       = entry.get("title", "タイトルなし")
    link        = entry.get("link", "")
    raw_summary = entry.get("summary", entry.get("description", "")) or ""
    published   = entry.get("published", "日付不明")
    return (
        f"# {title}\n\n"
        f"- **ソース**: {source_name}\n"
        f"- **公開日**: {published}\n"
        f"- **URL**: {link}\n"
        f"- **タグ**: #AIニュース #自動取得\n\n"
        f"## 要約（日本語）\n\n{translated}\n\n"
        f"## 原文抜粋\n\n{raw_summary[:500]}...\n\n---\n"
    )


def _safe_write(path: Path, content: str, retries: int = 3) -> bool:
    """iCloud のロック(EDEADLK)対策でリトライ付き書き込み"""
    for i in range(retries):
        try:
            path.write_text(content, encoding="utf-8")
            return True
        except OSError as e:
            if i < retries - 1:
                time.sleep(0.5)
            else:
                print(f"  書き込み失敗（スキップ）: {path.name}: {e}")
    return False


def run():
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    saved, skipped = 0, 0

    for source_name, feed_url in RSS_FEEDS:
        print(f"取得中: {source_name}")
        try:
            feed = feedparser.parse(feed_url)
        except Exception as e:
            print(f"  取得失敗: {e}")
            continue

        for entry in feed.entries[:PER_FEED]:
            title = entry.get("title", "untitled")
            safe_title = "".join(c for c in title if c.isalnum() or c in " _-").strip()[:50]
            filename = f"{today}_{safe_title}.md"
            filepath = VAULT_PATH / filename

            if filepath.exists():
                skipped += 1
                continue

            raw_text   = entry.get("summary", entry.get("description", "")) or ""
            translated = translate_with_ollama(raw_text)
            content    = entry_to_markdown(entry, source_name, translated)
            if _safe_write(filepath, content):
                saved += 1
                print(f"  保存: {filename}")

    print(f"完了: 保存 {saved} 件 / スキップ {skipped} 件 / モデル {OLLAMA_MODEL}")


if __name__ == "__main__":
    run()
