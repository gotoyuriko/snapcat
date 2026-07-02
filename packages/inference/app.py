"""
CodingKitty local inference service.

Replaces the (now-dead) external Ultralytics + HuggingFace inference APIs with
self-hosted models, so cat recognition runs fully offline:

  POST /detect  — YOLOv8n cat detection (COCO class 15) → highest-confidence box
  POST /embed   — MegaDescriptor-T-224 → 768-dim L2-normalized embedding

Both accept multipart/form-data with a `file` image field. The Node backend's
yolo.client.ts / megadescriptor.client.ts call these endpoints.
"""
import io

import numpy as np
import timm
import torch
import torchvision.transforms as T
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from ultralytics import YOLO

CAT_CLASS_ID = 15  # COCO "cat"
# Lower than the 0.25 default: phone close-ups of cats often score 0.15-0.25.
DETECT_CONF = 0.15
DEVICE = "cpu"

app = FastAPI(title="CodingKitty Inference")

# --- Load models once at startup (downloads weights on first run) -----------
print("Loading YOLOv8s...", flush=True)
yolo = YOLO("yolov8s.pt")  # 's' has notably better recall than 'n' on real photos

# Warm up the YOLO inference pipeline. Loading the weights above is not enough:
# Ultralytics does internal graph/layer-fusion setup lazily on the *first*
# .predict() call, which otherwise makes the first real scan pay a ~10s+
# cold-start cost (measured) instead of it happening during container startup,
# where the healthcheck's start_period already budgets for it.
print("Warming up YOLOv8s...", flush=True)
yolo.predict(Image.new("RGB", (224, 224)), conf=DETECT_CONF, verbose=False)

print("Loading MegaDescriptor-T-224...", flush=True)
embed_model = timm.create_model(
    "hf-hub:BVRA/MegaDescriptor-T-224", pretrained=True, num_classes=0
)
embed_model.eval().to(DEVICE)

embed_transform = T.Compose(
    [
        T.Resize((224, 224)),
        T.ToTensor(),
        T.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
    ]
)

# Determine the embedding dimension with a dummy forward pass.
with torch.no_grad():
    _dummy = torch.zeros(1, 3, 224, 224, device=DEVICE)
    EMBED_DIM = int(embed_model(_dummy).shape[1])
print(f"Models ready. Embedding dim = {EMBED_DIM}", flush=True)


def _read_image(raw: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(raw))
        # Honor EXIF orientation — phone photos are often stored sideways with an
        # orientation tag; without this YOLO sees a rotated cat and misses it.
        img = ImageOps.exif_transpose(img)
        return img.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}")


@app.get("/health")
def health():
    return {"status": "ok", "embedDim": EMBED_DIM}


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    """Return the highest-confidence cat bounding box, or detected=False."""
    img = _read_image(await file.read())
    results = yolo.predict(img, conf=DETECT_CONF, verbose=False)

    # Log everything YOLO saw (helps diagnose "no cat detected" on real photos).
    seen = [
        (yolo.names[int(b.cls)], round(float(b.conf), 2))
        for r in results
        for b in r.boxes
    ]
    print(f"/detect ({img.size[0]}x{img.size[1]}) saw: {seen}", flush=True)

    best = None
    for r in results:
        for b in r.boxes:
            if int(b.cls) != CAT_CLASS_ID:
                continue
            conf = float(b.conf)
            if best is None or conf > best["confidence"]:
                x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
                best = {
                    "confidence": conf,
                    "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                }

    if best is None:
        return {"detected": False}
    return {"detected": True, **best}


@app.post("/embed")
async def embed(file: UploadFile = File(...)):
    """Return a 768-dim L2-normalized MegaDescriptor embedding for the image."""
    img = _read_image(await file.read())
    x = embed_transform(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        feat = embed_model(x)[0].cpu().numpy().astype("float32")
    norm = float(np.linalg.norm(feat)) or 1.0
    return {"embedding": (feat / norm).tolist(), "dim": int(feat.shape[0])}
