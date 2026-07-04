# CodingKitty local-dev database image.
# PostGIS image already ships the PGDG apt repo, so we just add pgvector on top.
# Result: one Postgres 16 with BOTH PostGIS (geo) and pgvector (embeddings).
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -U -u 1000 appuser && chown -R 1000:1000 /var/lib/postgresql
USER 1000
