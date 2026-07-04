"""
CodingKitty local inference service.

Replaces the (now-dead) external Ultralytics + HuggingFace inference APIs with
self-hosted models, so cat recognition runs fully offline:

  POST /detect  — YOLOX-s cat detection (COCO class 15) → highest-confidence box
  POST /embed   — MegaDescriptor-T-224 → 768-dim L2-normalized embedding

Both accept multipart/form-data with a `file` image field. The Node backend's
yolo.client.ts / megadescriptor.client.ts call these endpoints.

/detect runs YOLOX-s (Apache-2.0, Megvii's official ONNX release) via
onnxruntime. It replaced YOLOv8s because `ultralytics` and its pretrained
weights are AGPL-3.0 — incompatible with this project, and the copyleft
extends to ONNX exports of those weights. YOLOX is COCO-trained too, so the
class ids and the /detect response shape are unchanged.
"""
import io

import numpy as np
import onnxruntime as ort
import timm
import torch
import torchvision.transforms as T
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps

CAT_CLASS_ID = 15  # COCO "cat"
# Lower than the usual 0.25 default: phone close-ups of cats often score 0.15-0.25.
DETECT_CONF = 0.15
NMS_IOU = 0.45
YOLOX_IMG_SIZE = 640
DEVICE = "cpu"

app = FastAPI(title="CodingKitty Inference")

# --- Load models once at startup (downloads weights on first run) -----------
print("Loading YOLOX-s (ONNX)...", flush=True)
yolox_session = ort.InferenceSession("yolox_s.onnx", providers=["CPUExecutionProvider"])


def _make_grids(img_size: int = YOLOX_IMG_SIZE):
    """Anchor-point grid + per-point stride for decoding YOLOX's raw outputs."""
    grids, strides = [], []
    for stride in (8, 16, 32):
        size = img_size // stride
        xv, yv = np.meshgrid(np.arange(size), np.arange(size))
        grid = np.stack((xv, yv), 2).reshape(-1, 2)
        grids.append(grid)
        strides.append(np.full((grid.shape[0], 1), stride))
    return (
        np.concatenate(grids).astype(np.float32),
        np.concatenate(strides).astype(np.float32),
    )


YOLOX_GRIDS, YOLOX_STRIDES = _make_grids()


def _preprocess(img: Image.Image):
    """YOLOX preprocessing: BGR 0-255, aspect-preserving resize onto a 114-gray
    canvas aligned top-left (no centering, no /255 normalization)."""
    w, h = img.size
    ratio = min(YOLOX_IMG_SIZE / h, YOLOX_IMG_SIZE / w)
    new_w, new_h = int(w * ratio), int(h * ratio)
    resized = img.resize((new_w, new_h), Image.BILINEAR)

    canvas = np.full((YOLOX_IMG_SIZE, YOLOX_IMG_SIZE, 3), 114, dtype=np.uint8)
    canvas[:new_h, :new_w] = np.asarray(resized)[:, :, ::-1]  # RGB -> BGR
    x = np.ascontiguousarray(canvas.transpose(2, 0, 1)[None], dtype=np.float32)
    return x, ratio


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float = NMS_IOU) -> list[int]:
    idxs = scores.argsort()[::-1]
    keep = []
    while idxs.size > 0:
        i = idxs[0]
        keep.append(int(i))
        if idxs.size == 1:
            break
        rest = idxs[1:]
        xx1 = np.maximum(boxes[i, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[i, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_rest = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
        iou = inter / (area_i + area_rest - inter + 1e-9)
        idxs = rest[iou <= iou_thresh]
    return keep


def _detect_cats(img: Image.Image) -> list[dict]:
    """Run YOLOX-s and return all cat detections as {confidence, box} dicts."""
    x, ratio = _preprocess(img)

    out = yolox_session.run(None, {"images": x})[0]
    preds = out[0]  # (8400, 85): [cx, cy, w, h, obj, class_0..class_79] (raw)

    # Decode grid-relative outputs into absolute pixel coordinates.
    preds[:, :2] = (preds[:, :2] + YOLOX_GRIDS) * YOLOX_STRIDES
    preds[:, 2:4] = np.exp(preds[:, 2:4]) * YOLOX_STRIDES

    cat_scores = preds[:, 4] * preds[:, 5 + CAT_CLASS_ID]  # obj_conf * cls_conf
    mask = cat_scores > DETECT_CONF
    if not mask.any():
        return []

    boxes_xywh = preds[mask, :4]
    cat_scores = cat_scores[mask]

    cx, cy, w, h = boxes_xywh.T
    boxes_xyxy = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)

    keep = _nms(boxes_xyxy, cat_scores)
    boxes_xyxy = boxes_xyxy[keep]
    cat_scores = cat_scores[keep]

    # Undo the resize to map boxes back to the original image (padding is
    # top-left aligned, so there is no offset to subtract).
    boxes_xyxy /= ratio

    return [
        {
            "confidence": float(conf),
            "box": {"x1": float(x1), "y1": float(y1), "x2": float(x2), "y2": float(y2)},
        }
        for conf, (x1, y1, x2, y2) in zip(cat_scores, boxes_xyxy)
    ]


# Warm up the ONNX session so the first real request doesn't pay the cold-start
# cost during the health check's start_period.
print("Warming up YOLOX-s...", flush=True)
_detect_cats(Image.new("RGB", (224, 224)))

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
        # orientation tag; without this the detector sees a rotated cat and misses it.
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
    detections = _detect_cats(img)

    # Log everything seen (helps diagnose "no cat detected" on real photos).
    print(f"/detect ({img.size[0]}x{img.size[1]}) saw: {detections}", flush=True)

    if not detections:
        return {"detected": False}
    best = max(detections, key=lambda d: d["confidence"])
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
