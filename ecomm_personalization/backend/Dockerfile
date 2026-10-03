# HPLPGA API — build from the ecomm_personalization/ folder so the image can include the storefront data:
#   docker build -f backend/Dockerfile -t aura-api .
# Serving needs only the trained artifacts (models/, processed/catalog.parquet) and project/data/*.json,
# not the 1.2 GB raw CSVs (those are for `python -m hplpga.pipeline.run`).
FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/hplpga ./hplpga
COPY backend/artifacts/models ./artifacts/models
COPY backend/artifacts/reports ./artifacts/reports
COPY backend/artifacts/processed/catalog.parquet ./artifacts/processed/catalog.parquet
COPY project/data ./project-data
ENV HPLPGA_ARTIFACTS_DIR=/app/artifacts \
    HPLPGA_FRONTEND_DATA=/app/project-data \
    PYTHONUNBUFFERED=1
EXPOSE 8000
# hosts such as Render/Railway pass the port in $PORT
CMD ["sh", "-c", "uvicorn hplpga.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
