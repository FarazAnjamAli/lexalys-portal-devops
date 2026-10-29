#!/usr/bin/env bash
# Same as package.ps1, for macOS/Linux/Git Bash:  bash deploy/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
OUT="dist/lexalys-portal-$(date +%Y%m%d-%H%M).zip"
zip -r -q "$OUT" package.json package-lock.json Procfile .env.example src views public db deploy/ec2 docs -x '*.DS_Store'
echo "Built $OUT"
unzip -l "$OUT" | tail -1
