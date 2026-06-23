# AI 執事アプリ 量産ガイド
## RET プロジェクト 完全技術仕様書

> 作成日: 2026-05-09  
> 対象プロジェクト: RET (https://your-project.pages.dev)  
> 次回類似アプリを作る際はこのファイルを起点にすること

---

## 目次

1. [アプリ全体像](#1-アプリ全体像)
2. [使用ツール・サービス一覧とキー](#2-使用ツール・サービス一覧とキー)
3. [インフラ構成図](#3-インフラ構成図)
4. [ファイル構成と役割](#4-ファイル構成と役割)
5. [3D モデル・座標完全仕様](#5-3d-モデル・座標完全仕様)
6. [AI チャット実装仕様](#6-ai-チャット実装仕様)
7. [顔認証実装仕様](#7-顔認証実装仕様)
8. [記憶機能 (AWS DynamoDB) 仕様](#8-記憶機能-aws-dynamodb-仕様)
9. [AR モード実装仕様](#9-ar-モード実装仕様)
10. [執事アイドルモード仕様](#10-執事アイドルモード仕様)
11. [量産手順 (新規アプリ作成)](#11-量産手順-新規アプリ作成)
12. [よくある問題と解決策](#12-よくある問題と解決策)

---

## 1. アプリ全体像

### 概要
- スマートフォンで動作する AI 執事会話アプリ
- 3D キャラクターが常駐、音声で会話できる
- 顔認証でユーザーを識別し名前で呼びかける
- 会話の記憶を AWS DynamoDB に永続保存
- ARモードでカメラ映像の上に 3D キャラクターを重畳表示

### 動作フロー
```
アプリ起動
  └─ 顔認証画面（カメラ起動 → 2秒後に照合）
       ├─ 認識済み → 「おかえりなさいませ、〇〇様」
       ├─ 未登録  → 名前入力フォーム → 登録 → アプリへ
       └─ サーバー未起動 / カメラ不可 → スキップしてアプリへ
  └─ メインアプリ
       ├─ 記憶をロード（AWS DynamoDB）
       ├─ 3D キャラクター表示（Three.js）
       ├─ マイクボタン → 音声認識 → AI 応答 → TTS
       ├─ 「覚えて」発話 → DynamoDB 保存
       ├─ 「クリア」発話 → 取扱説明書表示
       ├─ AR ボタン → カメラ背景重畳
       └─ 無操作 20秒 → ウロウロ + 執事自発発話（30〜120秒ごと）
```

---

## 2. 使用ツール・サービス一覧とキー

### 2-1. Cloudflare（無料枠）

| 項目 | 内容 |
|------|------|
| サービス | Cloudflare Pages（ホスティング） |
| アカウント | you@example.com |
| アカウント ID | `e57cdde5f4b925eb9608091648b1e9bb` |
| プロジェクト名 | `ret` |
| 本番 URL | https://your-project.pages.dev |
| CLI ログイン | `npx wrangler login`（OAuth、ブラウザで認証） |
| 認証トークン保存場所 | `~/.wrangler/config/default.toml` |

**Cloudflare KV（設定値ストア）**

| KV キー | 内容 |
|---------|------|
| `_config_ollama_url` | ローカル Ollama の Tunnel URL（毎回変わる） |
| `_config_ollama_model` | モデル名（例: `llama3`） |
| `_config_face_url` | 顔認証サーバーの Tunnel URL（毎回変わる） |
| `_config_memory_url` | AWS API Gateway URL（固定） |

```
KV Namespace ID: <your-kv-namespace-id>
KV Namespace 名: RET_MEMORY
```

**Cloudflare Workers AI（無料枠）**
- バインディング名: `AI`
- 使用モデル: `@cf/meta/llama-3.2-3b-instruct`
- Ollama 未起動時の自動フォールバック
- 設定: `wrangler.toml` の `[ai]` セクション

---

### 2-2. AWS（Free Tier）

| 項目 | 内容 |
|------|------|
| アカウント ID | `143301474624` |
| リージョン | `ap-northeast-1`（東京） |
| ルートアカウント | you@example.com |
| CLI 設定 | `aws configure` 済み（~/.aws/credentials） |

**使用サービスと設定**

| サービス | リソース名 | 用途 |
|---------|-----------|------|
| DynamoDB | `ret-memory` | 会話記憶の永続保存 |
| Lambda | `ret-memory` | DynamoDB CRUD API |
| Lambda | `ret-chat` | Ollama チャット中継（オプション） |
| API Gateway | `mgxzxd49sk` | Lambda へのエンドポイント |
| S3 | `ret-faces-143301474624` | 顔画像ストレージ（予備） |
| Budgets | アラート | $1/月でコスト通知 |

**API Gateway エンドポイント（固定 URL）**
```
https://mgxzxd49sk.execute-api.ap-northeast-1.amazonaws.com/prod
```

**DynamoDB テーブル設計**
```
テーブル名: ret-memory
パーティションキー: user_id (String)
ソートキー: timestamp (String)
属性: keyword, context
```

---

### 2-3. ローカル（Mac に必要なソフト）

| ソフト | インストール方法 | 用途 |
|-------|---------------|------|
| Ollama | https://ollama.ai からダウンロード | ローカル LLM |
| cloudflared | `brew install cloudflared` | HTTPS Tunnel |
| Python 3 | 標準搭載 | 顔認証サーバー |
| Node.js + npm | `brew install node` | wrangler CLI |
| AWS CLI | `brew install awscli` | AWS 操作 |

**Python パッケージ（`backend/requirements_face.txt`）**
```
fastapi
uvicorn
deepface
pillow
numpy
pydantic
```

---

### 2-4. 必要なキー・認証情報まとめ

```
【Cloudflare】
- wrangler login で OAuth 認証（ブラウザ）
- 追加キー不要

【AWS】
- ~/.aws/credentials に ACCESS_KEY_ID / SECRET_ACCESS_KEY
- aws configure で設定済み

【Ollama】
- キー不要（ローカル実行）

【その他 API キー】
- 不要（すべて無料サービス / ローカル）
```

---

## 3. インフラ構成図

```
[スマートフォン]
     │ HTTPS
     ▼
[Cloudflare Pages: your-project.pages.dev]
     │
     ├─ /api/chat  → Workers AI (@cf/meta/llama-3.2-3b-instruct)  ← 常時無料AI
     │               OR
     │               KV._config_ollama_url → Cloudflare Tunnel
     │                                           │
     │                                           ▼
     │                                    [Mac: Ollama :11434]
     │                                    llama3 / llama3.2 等
     │
     ├─ /api/memory → KV._config_memory_url → AWS API Gateway
     │                                              │
     │                                              ▼
     │                                    [Lambda: ret-memory]
     │                                              │
     │                                              ▼
     │                                    [DynamoDB: ret-memory]
     │
     └─ /api/face  → KV._config_face_url → Cloudflare Tunnel
                                               │
                                               ▼
                                    [Mac: FastAPI + DeepFace :8001]
```

---

## 4. ファイル構成と役割

```
~/RET/
├── wrangler.toml              ← Cloudflare 設定（KV + AI バインディング）
├── PRODUCTION_GUIDE.md        ← このファイル
├── WORK_REPORT.md             ← 作業履歴
│
├── public/                    ← フロントエンド（Cloudflare Pages で配信）
│   ├── index.html             ← HTML エントリーポイント
│   ├── css/
│   │   └── style.css          ← ホワイトテーマ CSS
│   ├── js/
│   │   ├── app.js             ← メイン制御（RETApp クラス）
│   │   ├── scene.js           ← Three.js シーン（SceneController）
│   │   ├── background.js      ← 床面のみのシンプル背景
│   │   ├── gemini.js          ← API チャットクライアント
│   │   └── voice.js           ← 音声認識 + TTS (Web Speech API)
│   └── models/
│       └── model.glb          ← 3D キャラクターモデル
│
├── functions/                 ← Cloudflare Pages Functions（サーバーレス）
│   └── api/
│       ├── chat.js            ← AI チャット API
│       ├── memory.js          ← 記憶 API（AWS Lambda プロキシ）
│       ├── face.js            ← 顔認証 API（Face Server プロキシ）
│       └── debug.js           ← デバッグ用
│
└── backend/                   ← ローカル Mac で動かすサーバー群
    ├── start_all.sh           ← 全自動起動スクリプト（1コマンド）
    ├── face_server.py         ← FastAPI 顔認証サーバー
    ├── requirements_face.txt  ← Python 依存パッケージ
    └── lambda/
        ├── chat.py            ← AWS Lambda: Ollama チャット
        └── memory.py          ← AWS Lambda: DynamoDB CRUD
```

---

## 5. 3D モデル・座標完全仕様

### モデル情報
```
ファイル: public/models/model.glb
元ファイル: scifi_soldier_character_low-poly.glb
リグ形式: Biped（ bip_ prefix）
ポリゴン数: Low-Poly（軽量）
```

### ボーン名一覧（`_cacheBones()` 検索キー）

| 変数名 | 検索文字列 | 実際のボーン名例 |
|--------|-----------|----------------|
| head | `bip_head` / `head` | Bip_Head |
| neck | `bip_neck` / `neck` | Bip_Neck |
| lArm | `bip_l_upperarm` | Bip_L_UpperArm |
| rArm | `bip_r_upperarm` | Bip_R_UpperArm |
| lForearm | `bip_l_forearm` | Bip_L_Forearm |
| rForearm | `bip_r_forearm` | Bip_R_Forearm |
| lHand | `bip_l_hand` | Bip_L_Hand |
| rHand | `bip_r_hand` | Bip_R_Hand |
| lClav | `bip_l_clavicle` | Bip_L_Clavicle |
| rClav | `bip_r_clavicle` | Bip_R_Clavicle |
| pelvis | `bip_pelvis` / `pelvis` | Bip_Pelvis |
| spine | `spine_` / `bip_spine` | Bip_Spine |
| spine1 | `spine1_` / `bip_spine1` | Bip_Spine1 |
| lThigh | `bip_l_thigh` | Bip_L_Thigh |
| rThigh | `bip_r_thigh` | Bip_R_Thigh |
| lCalf | `bip_l_calf` | Bip_L_Calf |
| rCalf | `bip_r_calf` | Bip_R_Calf |
| eyelidL | `eyelid_l` | Eyelid_L |
| eyelidR | `eyelid_r` | Eyelid_R |

### 確定済みボーンポーズ値（scene.js v=29）

**腕・鎖骨（`_applyArmPose` / `_maintainClavicles`）**
```js
// 鎖骨
lClav: rotation.set( 92*DEG, -180*DEG,  78*DEG)  // XYZ order
rClav: rotation.set( 92*DEG,  180*DEG, -78*DEG)

// 上腕
lArm:  rotation.set(-68*DEG,   2*DEG,  16*DEG)
rArm:  rotation.set(-68*DEG,  -2*DEG, -16*DEG)
```
> ⚠️ IMPORTANT: 腕を下げるために `lArm.rotation.z` を大きくしてはいけない  
> （肩が内側に崩れる。鎖骨で角度を作り、上腕は最小限の調整に留める）

**頭・首（`_applyHeadPose` / `_maintainClavicles`）**
```js
neck: rotation.set(-14*DEG, 0, 0)    // 少し前傾
head: rotation.set( -6*DEG, 0, 0)    // 自然な前傾
```

**下半身（`_applyLowerBodyPose`）**
```js
pelvis: rotation.set(-100.3*DEG, -1.5*DEG, -180*DEG)
lThigh: rotation.set(-180*DEG,   12.3*DEG, -14.5*DEG)
rThigh: rotation.set(-180*DEG,  -12.3*DEG,  14.5*DEG)
```

**まぶた初期値（`_initEyelids`）**
```js
eyelidL: rotation.x = -35*DEG   // 半開き
eyelidR: rotation.x = -35*DEG
```

### カメラ設定（`_fitCameraToModel`）

```js
// カメラ FOV
camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200)

// カメラ位置（ボーン BB から自動計算 + オフセット）
camera.position.set(center.x, camY, center.z + camDist + 0.5)
camera.lookAt(center.x, center.y + 0.5, center.z)

// 距離計算
distForH = size.y / (0.75 * 2 * tan(fovRad/2))       // 縦基準
distForW = (size.x * 0.6) / (0.80 * 2 * tan(horizFov/2))  // 横基準
camDist  = max(distForH, distForW, size.y * 0.3)
camY     = center.y + size.y * 0.10
```

### ライト設定

```js
// アンビエント（環境光）
AmbientLight: color=0xffffff, intensity=2.0

// キーライト（メインの影）
DirectionalLight: color=0xffffff, intensity=2.5, pos=(2,5,4), castShadow=true

// フィルライト（影の補完）
DirectionalLight: color=0xffffff, intensity=0.8, pos=(-3,3,-2)

// ホロライト（ポイント光源、脈動）
PointLight: color=0xffffff, intensity=0.3(±0.12でsin脈動), distance=10
```

### 歩行アニメ パラメータ

```js
walkSpeed    = 1.0 (WANDERING) / 1.5 (RETURNING)  // m/s
walkPhase   += dt * 5                               // 歩行位相速度
thighSwing   = ±40*DEG * sin(walkPhase)             // 太もも振れ幅
calfBend     = max(0, ±sin) * 30*DEG               // 膝曲がり
walkBob      = abs(sin(walkPhase*2)) * 0.025        // 上下揺れ
```

### 着座アニメ パラメータ

```js
sitProgress  : 0→1 (speed: 0.025/frame)
thighX       = lerp(TX, TX-75*DEG, p)   // 太もも前傾
thighZ       = lerp(0, 35*DEG, p)       // 太もも開き
calfX        = lerp(0, 100*DEG, p)      // 膝曲がり
```

### メッシュ名と Z-fighting 対策

```js
// ヘルメット（Object_73）→ 手前に出す
polygonOffsetFactor = -2, polygonOffsetUnits = -2

// 体・首肌（Object_77）→ 後ろに下げる
polygonOffsetFactor = +2, polygonOffsetUnits = +2
```

---

## 6. AI チャット実装仕様

### フロー

```
フロントエンド (gemini.js)
  POST /api/chat  { message, history, memories }
  ↓
functions/api/chat.js
  1. KV から _config_ollama_url を取得
  2. URL あり → Ollama /api/chat を呼び出し
     URL なし OR 接続失敗 → Workers AI にフォールバック
  3. { reply } を返す
```

### システムプロンプト（キャラクター設定）

```
あなたの名前は「あいなす」です。20代の物静かな男性執事です。
一人称は「私」を使ってください。
主人に仕える執事として、丁寧かつ控えめな口調でユーザーと会話してください。
返答は短く（2〜4文程度）にまとめ、感情表現は最小限に抑えてください。
声を荒げたり感情的になることはなく、常に落ち着いた穏やかな態度を保ちます。
「です・ます」調を基本とし、適度に執事らしい表現（「かしこまりました」「いかがでしょうか」等）を交えてください。
難しい専門用語は使わず、誠実で思いやりある言葉を選んでください。
```

### Ollama 設定

```
エンドポイント: {OLLAMA_URL}/api/chat
デフォルトモデル: llama3
起動コマンド: OLLAMA_ORIGINS="*" ollama serve
ポート: 11434
```

### Workers AI フォールバック

```js
env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
  messages,          // system + history + user
  max_tokens: 256,
})
```

### 履歴管理（gemini.js）

```js
history = [{role: 'user'|'model', parts: [{text: string}]}]
最大保持: 24件（超えたら古い順に削除）
送信時: 直近 20件を使用
```

---

## 7. 顔認証実装仕様

### フロー

```
1. カメラ起動（facingMode: 'user', 640x480）
2. 2秒後にキャプチャ → base64 JPEG
3. POST /api/face/verify { image: base64 }
   → Cloudflare Tunnel → FastAPI (port 8001)
   → DeepFace.verify (Facenet model)
4. matched=true → 名前を表示してアプリへ
   matched=false → 名前入力フォームを表示
5. 登録: POST /api/face/register { image, name }
6. サーバー未起動 → 503 → スキップしてアプリへ（graceful fallback）
```

### FastAPI エンドポイント

```
GET  /health          → {"status": "ok"}
POST /face/verify     → {matched, name, confidence}
POST /face/register   → {registered, name, total}
GET  /face/list       → {faces: [{id, name, registered_at}]}
DELETE /face/{id}     → {deleted: true}
```

### データ保存先（Mac ローカル）

```
顔 DB:     ~/.ret/faces.json
顔画像:    ~/.ret/face_images/{uuid}.jpg
```

### DeepFace 設定

```python
model_name="Facenet"
enforce_detection=False    # 顔が検出できなくてもエラーにしない
threshold=0.4              # distance < threshold で一致とみなす
```

---

## 8. 記憶機能 (AWS DynamoDB) 仕様

### 発動条件

```
ユーザーが「覚えて」を含む発話 → _saveMemory() 呼び出し
```

### 保存内容

```json
{
  "user_id": "default",
  "timestamp": "2026-05-09T12:34:56",
  "keyword": "覚えてほしいこと",
  "context": "直前の会話履歴 + 発話内容（4ターン分）"
}
```

### API エンドポイント（AWS API Gateway）

```
ベース URL: https://mgxzxd49sk.execute-api.ap-northeast-1.amazonaws.com/prod

GET    /memory/get?user_id=default&limit=10  → {memories: [...]}
POST   /memory/save                          → {saved: true}
DELETE /memory/delete                        → {deleted: true}
```

### Cloudflare Pages Function（プロキシ）

```
functions/api/memory.js
GET  /api/memory   → GET  /memory/get
POST /api/memory   → POST /memory/save
DEL  /api/memory   → DEL  /memory/delete
```

### 記憶のシステムプロンプトへの注入

```
【主人から覚えるよう言われたこと】
- {context1}
- {context2}
...
上記を自然に会話に活かしてください。
```

---

## 9. AR モード実装仕様

### 優先順位

```
1. WebXR immersive-ar（Android Chrome / iOS Safari 15.4+）
2. フォールバック: カメラ映像を背景に重畳（CSS + video要素）
```

### WebXR 設定

```js
navigator.xr.requestSession('immersive-ar', {
  requiredFeatures: ['local'],
  optionalFeatures: ['hit-test', 'dom-overlay'],
  domOverlay: { root: document.getElementById('app') },
})
```

### デバイス傾き追従（カメラフォールバック時）

```js
// deviceorientation イベントから beta / gamma を取得
tiltX = clamp(beta - 75, -20, 20) * DEG * 0.15   // 前後傾き
tiltY = clamp(gamma, -20, 20)    * DEG * 0.15   // 左右傾き
camera.rotation.x = lerp(current, tiltX, 0.06)
camera.rotation.y = lerp(current, tiltY, 0.06)

// iOS の場合は許可リクエストが必要
DeviceOrientationEvent.requestPermission()
```

---

## 10. 執事アイドルモード仕様

### ウロウロ挙動（20秒無操作後）

```
確率分布:
  40%: 左右へ歩く（1.0〜2.5m、3〜6秒後に次アクション）
  25%: 座る（4〜9秒後に立つ）
  20%: 小刻みにうろつく（0.5〜1.3m）
  15%: 画面外へ → 2〜3.5秒後に戻ってくる
```

### 執事自発発話（30〜120秒ごと）

```js
BUTLER_MIN_MS = 30_000
BUTLER_MAX_MS = 120_000
```

時間帯別フレーズ:

| 時間帯 | 時刻 | フレーズ例 |
|--------|------|-----------|
| morning | 5〜11時 | 「おはようございます。本日もどうぞよい一日を。」 |
| afternoon | 11〜17時 | 「今日のご予定はいかがでしょうか。」 |
| evening | 17〜22時 | 「本日もお疲れ様でございました。」 |
| night | 22〜5時 | 「そろそろお休みになられてはいかがでしょうか。」 |

---

## 11. 量産手順（新規アプリ作成）

### ステップ 1: プロジェクトコピー

```bash
cp -r ~/RET ~/NEW_PROJECT
cd ~/NEW_PROJECT
```

### ステップ 2: Cloudflare Pages プロジェクト作成

```bash
# プロジェクト名を決める（例: myapp）
npx wrangler pages project create myapp --production-branch=main

# wrangler.toml を更新
# name = "myapp" に変更
```

### ステップ 3: Cloudflare KV 作成

```bash
npx wrangler kv namespace create "MYAPP_MEMORY" --remote
# → ID が発行される（wrangler.toml の id を更新）
```

### ステップ 4: AWS DynamoDB / Lambda 設定

```bash
# 既存の ret プロジェクトのものを流用する場合はスキップ
# 新規作成する場合:
cd ~/NEW_PROJECT/backend
bash deploy.sh   # IAM/DynamoDB/Lambda/API Gateway を一括作成
```

### ステップ 5: キャラクター変更

**名前・性格変更** → `functions/api/chat.js` の `SYSTEM_PROMPT`

**3D モデル変更**
1. GLB ファイルを `public/models/model.glb` に配置（25MB 以下）
2. `scene.js` の `_cacheBones()` でボーン名を確認
3. ブラウザコンソールで `[RET] bones found:` を確認
4. `_applyArmPose()` のポーズ値を調整

### ステップ 6: KV バインディング確認

```bash
# wrangler.toml
[[kv_namespaces]]
binding = "RET_MEMORY"
id = "（新しいID）"

[ai]
binding = "AI"
```

### ステップ 7: デプロイ

```bash
npx wrangler pages deploy public --project-name=myapp --commit-dirty=true
```

### ステップ 8: 起動スクリプト更新

`backend/start_all.sh` の以下を変更:
```bash
KV_ID="（新しい KV ID）"
PROJECT_NAME="myapp"
AWS_MEMORY_URL="（API Gateway URL）"
```

---

## 12. よくある問題と解決策

### チャットが「Ollama が未起動です」と言う

**原因**: KV に Ollama URL が入っていない  
**解決**: Workers AI フォールバックが自動で動く（start_all.sh 不要）  
**確認**: `curl -X POST https://xxx.pages.dev/api/chat -H "Content-Type: application/json" -d '{"message":"test","history":[]}'`

---

### 3D モデルが T ポーズ（腕が横に伸びた状態）になる

**原因**: ボーン名が一致していない  
**確認**: ブラウザコンソールで `[RET] bones found:` のログを確認  
**解決**: `_cacheBones()` の検索文字列を実際のボーン名に合わせて追加

---

### 腕ポーズを変えたら肩が崩れた

**原因**: `lArm.rotation.z` を大きくすると SkinnedMesh の肩が内側に陥没する  
**解決**: `lClav`（鎖骨）の `rotation.y` と `rotation.z` で腕の位置を調整し、`lArm` は最小限に

---

### モデルが表示されない / 半透明になる

**原因**: 25MB を超えるファイルは Cloudflare Pages が拒否  
**確認**: `ls -lh public/models/model.glb`  
**解決**: Blender でメッシュを減らすか、テクスチャを圧縮する

---

### 顔認証が毎回「はじめまして」になる

**原因**: face_server.py が起動していない（`start_all.sh` 未実行）  
**動作**: 503 → graceful fallback → スキップしてアプリへ（正常動作）

---

### AWS DynamoDB に保存できない

**確認手順**:
```bash
# API Gateway が生きているか確認
curl https://mgxzxd49sk.execute-api.ap-northeast-1.amazonaws.com/prod/memory/get?user_id=default

# Lambda ログ確認
aws logs get-log-events --log-group-name /aws/lambda/ret-memory \
  --log-stream-name "$(aws logs describe-log-streams --log-group-name /aws/lambda/ret-memory \
  --order-by LastEventTime --descending --max-items 1 \
  --query 'logStreams[0].logStreamName' --output text)"
```

---

### Cloudflare KV バインディングが Pages に反映されない

```bash
# wrangler deploy 後に REST API で強制バインド
TOKEN=$(grep oauth_token ~/.wrangler/config/default.toml | awk -F'"' '{print $2}')
ACCOUNT_ID="e57cdde5f4b925eb9608091648b1e9bb"
KV_ID="（KV Namespace ID）"

curl -s -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/myapp" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "deployment_configs": {
      "production": {
        "kv_namespaces": {
          "RET_MEMORY": {"namespace_id": "'${KV_ID}'"}
        }
      }
    }
  }'
```

---

### wrangler の OAuth トークンが期限切れ

```bash
npx wrangler login   # ブラウザが開く → Cloudflare でログイン
```

---

## 付録 A: 1コマンド起動（量産後の毎回の手順）

```bash
# ローカル AI（高品質）を使う場合
bash ~/RET/backend/start_all.sh

# Workers AI（常時オン）だけ使う場合
# → 何もしなくていい。アプリ URL を開くだけ
open https://your-project.pages.dev
```

---

## 付録 B: デプロイコマンド集

```bash
# 通常デプロイ
npx wrangler pages deploy public --project-name=ret --commit-dirty=true

# KV 値の確認
npx wrangler kv key list --namespace-id=<your-kv-namespace-id> --remote

# KV 値の書き込み
npx wrangler kv key put --namespace-id=<your-kv-namespace-id> "_config_ollama_url" "https://xxx.trycloudflare.com" --remote

# KV 値の削除
npx wrangler kv key delete --namespace-id=<your-kv-namespace-id> "_config_ollama_url" --remote
```

---

## 付録 C: 新規アプリのチェックリスト

```
□ プロジェクトをコピーした
□ wrangler.toml の name を変更した
□ Cloudflare Pages プロジェクトを作成した
□ KV Namespace を作成し ID を wrangler.toml に反映した
□ SYSTEM_PROMPT のキャラクター設定を変更した
□ 3D モデルを差し替えた（25MB 以下）
□ ボーン名を確認・調整した
□ start_all.sh の KV_ID / PROJECT_NAME を変更した
□ デプロイした
□ curl でチャット API をテストした
□ 顔認証をテストした（サーバー起動後）
□ 記憶機能をテストした（「覚えて」と発話）
```
