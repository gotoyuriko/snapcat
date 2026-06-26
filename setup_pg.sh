#!/bin/bash
set -e

echo "=== Step 1: Adding PostgreSQL 16 APT repository ==="
CODENAME=$(lsb_release -cs)
echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

echo "=== Step 2: Updating APT and installing PostgreSQL 16 + PostGIS ==="
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql-16 postgresql-16-postgis-3 postgresql-server-dev-16 build-essential git

echo "=== Step 3: Starting PostgreSQL service ==="
sudo service postgresql start

echo "=== Step 4: Installing pgvector ==="
cd /tmp
if [ -d pgvector ]; then
  rm -rf pgvector
fi
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
cd pgvector
make PG_CONFIG=/usr/bin/pg_config
sudo make install PG_CONFIG=/usr/bin/pg_config
cd /tmp
rm -rf pgvector

echo "=== Step 5: Creating database and user ==="
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='codingkitty'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER codingkitty WITH PASSWORD 'codingkitty_dev_pwd';"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='codingkitty_dev'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE codingkitty_dev OWNER codingkitty;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE codingkitty_dev TO codingkitty;"
sudo -u postgres psql -d codingkitty_dev -c "GRANT ALL ON SCHEMA public TO codingkitty;"

echo "=== Step 6: Enabling extensions ==="
sudo -u postgres psql -d codingkitty_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d codingkitty_dev -c "CREATE EXTENSION IF NOT EXISTS vector;"
sudo -u postgres psql -d codingkitty_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

echo "=== Step 7: Verifying extensions ==="
sudo -u postgres psql -d codingkitty_dev -c "SELECT extname FROM pg_extension;"

echo "=== PostgreSQL 16 setup complete! ==="
