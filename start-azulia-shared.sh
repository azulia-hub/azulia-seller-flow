#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${VITE_AZULIA_SHARED_ENDPOINT:-}" ]]; then
  echo 'Set VITE_AZULIA_SHARED_ENDPOINT to your deployed /.netlify/functions/shared URL first.' >&2
  exit 1
fi
VITE_AZULIA_DELIVERY=shared npm run build
AZULIA_SHARED_MODE=1 npm run local:start
