# Cloudflare KV セットアップ（記憶機能）

> 完全無料。AWS不要。

---

## STEP 1 ｜ KV ネームスペース作成

> **画面：** https://dash.cloudflare.com/

1. 左メニュー **「Workers & Pages」** → **「KV」**
2. **「名前空間を作成」**
3. 名前：`ret-memory` → **「追加」**
4. 作成された行の **「ID」** をコピー
   ```
   例: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
   ```

---

## STEP 2 ｜ wrangler.toml に ID を貼る

`~/RET/wrangler.toml` を開いて `PLACEHOLDER_KV_ID` を書き換え：

```toml
[[kv_namespaces]]
binding = "RET_MEMORY"
id = "（STEP 1 でコピーしたID）"
```

---

## STEP 3 ｜ Pages プロジェクトにKVをバインド

> **画面：** https://dash.cloudflare.com/

1. **「Workers & Pages」** → `ret` プロジェクト
2. **「設定」** タブ → **「バインディング」**
3. **「KV 名前空間を追加」**
   - 変数名：`RET_MEMORY`
   - KV 名前空間：`ret-memory`
4. **「保存」**

---

## STEP 4 ｜ デプロイ

```bash
cd ~/RET
npx wrangler pages deploy public --project-name=ret --commit-message="記憶機能追加"
```

---

## 動作確認

マイクで「今日は晴れです、覚えて」と言う  
→ あいなすが「かしこまりました。覚えておきます。」と返答  
→ 次回の会話でそれを踏まえた返答をする

---

## 記憶を削除したい場合

```bash
curl -X DELETE https://your-project.pages.dev/api/memory
```
