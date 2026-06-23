"""
RET 顔認証サーバー（FastAPI + DeepFace）
iPhone / MacBook カメラ対応

起動: python3 backend/face_server.py
Port: 8001
"""

from __future__ import annotations
import base64, json, os, uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image
import io
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 顔データ保存先
FACES_DB = Path.home() / ".ret" / "faces.json"
FACES_DB.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="RET Face Auth")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── deepface の遅延ロード ──────────────────────────────────
_deepface = None
def get_deepface():
    global _deepface
    if _deepface is None:
        from deepface import DeepFace as df
        _deepface = df
    return _deepface


# ── 顔DB操作 ──────────────────────────────────────────────
def load_faces() -> list[dict]:
    if not FACES_DB.exists():
        return []
    return json.loads(FACES_DB.read_text(encoding="utf-8"))

def save_faces(faces: list[dict]):
    FACES_DB.write_text(json.dumps(faces, ensure_ascii=False, indent=2), encoding="utf-8")

def base64_to_img_path(b64: str) -> str:
    """base64画像を一時ファイルに書き込み、パスを返す"""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    data = base64.b64decode(b64)
    img  = Image.open(io.BytesIO(data)).convert("RGB")
    tmp  = Path("/tmp") / f"ret_face_{uuid.uuid4().hex}.jpg"
    img.save(str(tmp), "JPEG")
    return str(tmp)


# ── エンドポイント ──────────────────────────────────────────
class VerifyRequest(BaseModel):
    image: str          # base64 JPEG/PNG

class RegisterRequest(BaseModel):
    image: str          # base64 JPEG/PNG
    name: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/face/verify")
def verify(req: VerifyRequest):
    """
    カメラ画像を送信 → 登録済み顔と照合
    Returns: {matched: bool, name: str|None, confidence: float}
    """
    faces = load_faces()
    if not faces:
        return {"matched": False, "name": None, "confidence": 0.0, "reason": "no_faces"}

    tmp_path = base64_to_img_path(req.image)
    df = get_deepface()

    best_name  = None
    best_score = 0.0

    for face in faces:
        face_img_path = face.get("img_path")
        if not face_img_path or not os.path.exists(face_img_path):
            continue
        try:
            result = df.verify(
                img1_path=tmp_path,
                img2_path=face_img_path,
                model_name="Facenet",
                enforce_detection=False,
            )
            # distance が小さいほど類似（0=完全一致）
            distance  = result.get("distance", 1.0)
            threshold = result.get("threshold", 0.4)
            score     = max(0.0, 1.0 - distance / threshold)
            if result.get("verified") and score > best_score:
                best_score = score
                best_name  = face["name"]
        except Exception as e:
            print(f"[Face] verify error for {face['name']}: {e}")
            continue

    os.unlink(tmp_path)

    if best_name:
        return {"matched": True, "name": best_name, "confidence": round(best_score, 3)}
    return {"matched": False, "name": None, "confidence": 0.0}


@app.post("/face/register")
def register(req: RegisterRequest):
    """
    顔画像と名前を登録する
    """
    faces = load_faces()
    img_dir  = Path.home() / ".ret" / "face_images"
    img_dir.mkdir(exist_ok=True)

    face_id  = uuid.uuid4().hex
    img_path = str(img_dir / f"{face_id}.jpg")

    # 画像保存
    if "," in req.image:
        b64 = req.image.split(",", 1)[1]
    else:
        b64 = req.image
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    img.save(img_path, "JPEG")

    faces.append({
        "id":           face_id,
        "name":         req.name.strip(),
        "img_path":     img_path,
        "registered_at": datetime.now().isoformat(),
    })
    save_faces(faces)

    return {"registered": True, "name": req.name.strip(), "total": len(faces)}


@app.get("/face/list")
def list_faces():
    faces = load_faces()
    return {"faces": [{"id": f["id"], "name": f["name"], "registered_at": f.get("registered_at")} for f in faces]}


@app.delete("/face/{face_id}")
def delete_face(face_id: str):
    faces = load_faces()
    faces = [f for f in faces if f["id"] != face_id]
    save_faces(faces)
    return {"deleted": True}


if __name__ == "__main__":
    print("=== RET 顔認証サーバー起動 ===")
    print("URL: http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="warning")
