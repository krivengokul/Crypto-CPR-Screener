#!/usr/bin/env bash
# End-to-end self-test on SYNTHETIC data (no internet needed):
#   mock data host -> download_klines.py -> run.ts -> grades.csv
# Usage (from repo root):  bash tools/offline-grader/test/selftest.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"; PORT=8765
export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1
python3 "$HERE/mock_binance_vision.py" $PORT & MOCK=$!
trap 'kill $MOCK 2>/dev/null || true; rm -rf "$TMP"' EXIT
sleep 2
python3 "$HERE/../download_klines.py" --out "$TMP/data" --days 14 --top 6 \
  --base "http://127.0.0.1:$PORT" --list-url "http://127.0.0.1:$PORT/list" --workers 8
cd "$ROOT"
# The 20 real Views are narrow and rarely match random data, so grade Views that do.
npx --yes tsx tools/offline-grader/test/pick_matching.ts "$TMP/data" "$TMP/views.json"
npx --yes tsx tools/offline-grader/run.ts --data "$TMP/data" --out "$TMP/out" --days 14 --views "$TMP/views.json"
test -s "$TMP/out/grades.csv" && echo "SELFTEST OK"
