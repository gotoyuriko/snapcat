# --- Runtime image ------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# CPU-only torch/torchvision — much smaller than the default CUDA wheels.
RUN pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# YOLOX-s (Apache-2.0) — official ONNX model published by Megvii. Replaces the
# former YOLOv8s export: `ultralytics` and its pretrained weights are AGPL-3.0,
# which is incompatible with this project, and that extends to ONNX exports of
# its weights.
ADD https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx .

COPY app.py .

# MegaDescriptor weights download on first startup into this cache; mount a
# volume on it (see docker-compose) so it persists across restarts.
ENV HF_HOME=/cache/hf \
    MPLCONFIGDIR=/cache/mpl

EXPOSE 8000
RUN useradd -U -u 1000 appuser && chown -R 1000:1000 /app
USER 1000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
