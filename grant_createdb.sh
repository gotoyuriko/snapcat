#!/bin/bash
set -e
sudo -u postgres psql -c "ALTER USER codingkitty CREATEDB;"
echo "CREATEDB permission granted to codingkitty"
