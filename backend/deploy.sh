#!/bin/bash
# RET バックエンド デプロイスクリプト
# 事前に: aws configure でアクセスキーを設定してください

set -e

REGION="ap-northeast-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_NAME="ret-lambda-role"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo "=== RET AWS セットアップ ==="
echo "アカウントID: ${ACCOUNT_ID}"
echo "リージョン: ${REGION}"

# ── 1. IAM ロール作成 ────────────────────────────────────
echo ""
echo "▶ IAM ロール作成中..."
aws iam create-role \
  --role-name "${ROLE_NAME}" \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"lambda.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }' 2>/dev/null || echo "  （ロール既存）"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/AmazonRekognitionFullAccess"

aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/AmazonS3FullAccess"

echo "  ✅ IAM ロール設定完了"
sleep 10  # ロール伝播待ち

# ── 2. DynamoDB テーブル作成 ─────────────────────────────
echo ""
echo "▶ DynamoDB テーブル作成中..."
aws dynamodb create-table \
  --table-name "ret-memory" \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" 2>/dev/null || echo "  （テーブル既存）"
echo "  ✅ DynamoDB: ret-memory"

# ── 3. S3 バケット作成 ───────────────────────────────────
echo ""
echo "▶ S3 バケット作成中..."
BUCKET_NAME="ret-faces-${ACCOUNT_ID}"
aws s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}" \
  --create-bucket-configuration LocationConstraint="${REGION}" 2>/dev/null || echo "  （バケット既存）"

# パブリックアクセスブロック（顔データ保護）
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  ✅ S3: ${BUCKET_NAME}"

# ── 4. Lambda 関数デプロイ ───────────────────────────────
echo ""
echo "▶ Lambda 関数パッケージ作成中..."
cd "$(dirname "$0")/lambda"

# chat.py
zip -q chat.zip chat.py
aws lambda create-function \
  --function-name "ret-chat" \
  --runtime "python3.12" \
  --role "${ROLE_ARN}" \
  --handler "chat.lambda_handler" \
  --zip-file "fileb://chat.zip" \
  --timeout 30 \
  --environment "Variables={OLLAMA_URL=http://localhost:11434,OLLAMA_MODEL=llama3}" \
  --region "${REGION}" 2>/dev/null || \
aws lambda update-function-code \
  --function-name "ret-chat" \
  --zip-file "fileb://chat.zip" \
  --region "${REGION}"
echo "  ✅ Lambda: ret-chat"

# memory.py
zip -q memory.zip memory.py
aws lambda create-function \
  --function-name "ret-memory" \
  --runtime "python3.12" \
  --role "${ROLE_ARN}" \
  --handler "memory.lambda_handler" \
  --zip-file "fileb://memory.zip" \
  --timeout 15 \
  --environment "Variables={DYNAMODB_TABLE=ret-memory}" \
  --region "${REGION}" 2>/dev/null || \
aws lambda update-function-code \
  --function-name "ret-memory" \
  --zip-file "fileb://memory.zip" \
  --region "${REGION}"
echo "  ✅ Lambda: ret-memory"

rm -f chat.zip memory.zip
cd -

echo ""
echo "=== ✅ デプロイ完了 ==="
echo "次のステップ: API Gateway を AWS コンソールで設定してください"
echo "詳細: AWS_SETUP.md を参照"
