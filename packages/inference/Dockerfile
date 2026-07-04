FROM python:3.11-slim

WORKDIR /app

# libgl1 + libglib2.0-0: required by OpenCV (pulled in by ultralytics).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch/torchvision — much smaller than the default CUDA wheels.
RUN pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Model weights download on first startup into these caches; mount a volume on
# them (see docker-compose) so they persist across restarts.
ENV HF_HOME=/cache/hf \
    YOLO_CONFIG_DIR=/cache/ultralytics \
    MPLCONFIGDIR=/cache/mpl

EXPOSE 8000
RUN useradd -U -u 1000 appuser && chown -R 1000:1000 /app
USER 1000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
