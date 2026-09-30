#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
image="${1:-codedoodles-assets:local}"
revision="$(git rev-parse HEAD)"
epoch="$(git show -s --format=%ct HEAD)"
docker build --platform linux/amd64 --provenance=false --build-arg "VCS_REF=$revision" \
  --build-arg "SOURCE_DATE_EPOCH=$epoch" -t "$image" .
