# AWS セットアップ手順（RET プロジェクト）

> ⚠️ **全て無料枠（Free Tier）内で構築します**

---

## STEP 1 ｜ AWS CLI インストール

ターミナルで実行：

```bash
brew install awscli
aws --version   # aws-cli/2.x.x が表示されればOK
```

---

## STEP 2 ｜ IAM ユーザー作成（AWSコンソール）

> **画面：** https://console.aws.amazon.com/iam/

1. 左メニュー **「ユーザー」** → **「ユーザーを作成」**
2. ユーザー名：`ret-admin`
3. **「AWSマネジメントコンソールへのアクセスを許可」は OFF**（チェックしない）
4. 次へ → **「ポリシーを直接アタッチ」** を選択
5. 以下のポリシーを検索して追加：
   - `AmazonDynamoDBFullAccess`
   - `AmazonS3FullAccess`
   - `AWSLambda_FullAccess`
   - `AmazonAPIGatewayAdministrator`
   - `AmazonRekognitionFullAccess`
   - `IAMFullAccess`
   - `AWSBudgetsActionsWithAWSResourceControlPolicy`
6. **「ユーザーを作成」**
7. 作成したユーザーをクリック → **「セキュリティ認証情報」タブ**
8. **「アクセスキーを作成」** → 「コマンドラインインターフェイス（CLI）」を選択
9. **アクセスキーID** と **シークレットアクセスキー** をメモ（このページを閉じると二度と見れない）

---

## STEP 3 ｜ AWS CLI 認証設定

ターミナルで実行：

```bash
aws configure
```

入力内容：
```
AWS Access Key ID:     （STEP 2 でコピーしたキー）
AWS Secret Access Key: （STEP 2 でコピーしたシークレット）
Default region name:   ap-northeast-1
Default output format: json
```

確認：
```bash
aws sts get-caller-identity
# "Account": "123456789012" が表示されればOK
```

---

## STEP 4 ｜ AWS Budgets アラート設定

> **画面：** https://console.aws.amazon.com/billing/home#/budgets

1. **「予算を作成」**
2. **「コスト予算」** を選択 → 次へ
3. 設定：
   - 予算名：`ret-cost-alert`
   - 予算額：`$1.00`（月額）
   - メールアドレス：`you@example.com`
4. **「予算を作成」**

> ✅ これで月$1を超えそうになるとメールが来ます

---

## STEP 5 ｜ バックエンド一括デプロイ

STEP 3 の認証が完了したら、ターミナルで実行：

```bash
cd ~/RET/backend
bash deploy.sh
```

以下が自動で作成されます：
- IAM ロール `ret-lambda-role`
- DynamoDB テーブル `ret-memory`
- S3 バケット `ret-faces-{アカウントID}`
- Lambda関数 `ret-chat`、`ret-memory`

---

## STEP 6 ｜ API Gateway 設定（AWSコンソール）

> **画面：** https://console.aws.amazon.com/apigateway/

1. **「APIを作成」** → **「REST API」** → **「構築」**
2. API名：`ret-api`、エンドポイントタイプ：`リージョン` → **「APIを作成」**

### `/chat` エンドポイント
3. **「リソースを作成」** → リソースパス：`chat`
4. `chat` を選択 → **「メソッドを作成」** → `POST`
5. 統合タイプ：**Lambda関数** → `ret-chat` を選択
6. **「CORS を有効にする」** にチェック → 保存

### `/memory/save` エンドポイント
7. `memory` リソース → `save` リソース → `POST` メソッド → `ret-memory`

### `/memory/get` エンドポイント
8. `memory/get` → `GET` メソッド → `ret-memory`

### デプロイ
9. **「APIをデプロイ」** → ステージ名：`prod` → **「デプロイ」**
10. 表示される **「呼び出しURL」** をメモ：
    ```
    https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
    ```

---

## STEP 7 ｜ フロントエンドにAPIエンドポイントを設定

`~/RET/public/js/gemini.js` の `API_ENDPOINT` を更新：

```js
const API_ENDPOINT = 'https://xxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/chat';
```

> ⚠️ `xxxxxxxx` は STEP 6 でメモしたURLに差し替えてください

---

## 完了チェックリスト

- [ ] STEP 1: AWS CLI インストール
- [ ] STEP 2: IAM ユーザー `ret-admin` 作成・アクセスキー取得
- [ ] STEP 3: `aws configure` 完了
- [ ] STEP 4: Budgets アラート設定（$1）
- [ ] STEP 5: `bash deploy.sh` 実行成功
- [ ] STEP 6: API Gateway 設定・デプロイURL取得
- [ ] STEP 7: フロントエンドのAPIエンドポイント更新

---

## 各サービスの無料枠

| サービス | 無料枠 | RETの想定使用量 |
|---------|--------|---------------|
| Lambda | 月100万リクエスト、400,000GB秒 | ✅ 余裕あり |
| DynamoDB | 25GB ストレージ、25RCU/WCU | ✅ 余裕あり |
| S3 | 5GB、20,000 GET | ✅ 余裕あり |
| Rekognition | 月1,000画像（12ヶ月） | ✅ 余裕あり |
| API Gateway | 月100万コール（12ヶ月） | ✅ 余裕あり |
