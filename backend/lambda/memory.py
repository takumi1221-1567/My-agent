"""
Lambda: POST /memory/save  — 「覚えて」トリガーでDynamoDBに保存
        GET  /memory/get   — 直近の記憶を取得して会話に使う
"""

import json
import os
import time
import uuid
import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "myagent-memory")
dynamodb   = boto3.resource("dynamodb")
table      = dynamodb.Table(TABLE_NAME)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": CORS, "body": ""}

    path   = event.get("path", "")
    method = event.get("httpMethod", "GET")

    if method == "POST" and "/save" in path:
        return _save(event)
    elif method == "GET" and "/get" in path:
        return _get(event)

    return _error(404, "Not Found")


def _save(event):
    try:
        body    = json.loads(event.get("body") or "{}")
        context_text = body.get("context", "").strip()
        keyword      = body.get("keyword", "").strip()
        user_id      = body.get("user_id", "default")
    except Exception:
        return _error(400, "Invalid JSON body")

    if not context_text:
        return _error(400, '"context" is required')

    item = {
        "user_id":   user_id,
        "timestamp": str(int(time.time() * 1000)),
        "id":        str(uuid.uuid4()),
        "keyword":   keyword,
        "context":   context_text,
    }

    try:
        table.put_item(Item=item)
    except Exception as e:
        return _error(500, f"DynamoDB保存エラー: {e}")

    return {
        "statusCode": 200,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps({"saved": True}, ensure_ascii=False),
    }


def _get(event):
    user_id = event.get("queryStringParameters", {}).get("user_id", "default")
    limit   = int(event.get("queryStringParameters", {}).get("limit", "5"))

    try:
        result = table.query(
            KeyConditionExpression=Key("user_id").eq(user_id),
            ScanIndexForward=False,  # 新しい順
            Limit=limit,
        )
        items = result.get("Items", [])
    except Exception as e:
        return _error(500, f"DynamoDB取得エラー: {e}")

    return {
        "statusCode": 200,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps({"memories": items}, ensure_ascii=False),
    }


def _error(status, message):
    return {
        "statusCode": status,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps({"error": message}, ensure_ascii=False),
    }
