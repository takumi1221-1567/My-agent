"""
Lambda: POST /chat
Ollamaローカルサーバーにリクエストを転送してAI執事の返答を返す。
環境変数 OLLAMA_URL にローカルマシンのOllama URLを設定する。
（例: http://192.168.1.x:11434）
"""

import json
import os
import urllib.request
import urllib.error

OLLAMA_URL   = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3")

SYSTEM_PROMPT = """あなたの名前は「AI執事」です。20代の物静かな男性執事です。
一人称は「私」を使ってください。
主人に仕える執事として、丁寧かつ控えめな口調でユーザーと会話してください。
返答は短く（2〜4文程度）にまとめ、感情表現は最小限に抑えてください。
声を荒げたり感情的になることはなく、常に落ち着いた穏やかな態度を保ちます。
「です・ます」調を基本とし、適度に執事らしい表現（「かしこまりました」「いかがでしょうか」等）を交えてください。
難しい専門用語は使わず、誠実で思いやりある言葉を選んでください。"""

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": CORS, "body": ""}

    try:
        body    = json.loads(event.get("body") or "{}")
        message = body.get("message", "").strip()
        history = body.get("history", [])
    except Exception:
        return _error(400, "Invalid JSON body")

    if not message:
        return _error(400, '"message" is required')

    # Ollamaメッセージ形式に変換
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-20:]:
        role    = "assistant" if h.get("role") == "model" else "user"
        content = h.get("parts", [{}])[0].get("text", "")
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    payload = json.dumps({
        "model":    OLLAMA_MODEL,
        "messages": messages,
        "stream":   False,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data  = json.loads(resp.read())
            reply = data.get("message", {}).get("content", "").strip()
    except urllib.error.URLError as e:
        return _error(502, f"Ollama接続エラー: {e.reason}")
    except Exception as e:
        return _error(502, str(e))

    if not reply:
        return _error(502, "Ollamaから空の返答")

    return {
        "statusCode": 200,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps({"reply": reply}, ensure_ascii=False),
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps({"error": message}, ensure_ascii=False),
    }
