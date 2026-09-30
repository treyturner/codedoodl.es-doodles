#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
image="${1:?Usage: scan-image.sh IMAGE}"
mkdir -p tests/artifacts/security build
scan_dir="$(mktemp -d "$PWD/build/scan.XXXXXX")"
trap 'rm -rf -- "$scan_dir"' EXIT
docker build -t codedoodles-assets-scanner:local security
docker image save "$image" -o "$scan_dir/image.tar"
docker run --rm -e TRIVY_CACHE_DIR=/tmp/trivy \
  -v "$scan_dir:/input:ro" -v "$PWD/tests/artifacts/security:/output" \
  codedoodles-assets-scanner:local image --input /input/image.tar --scanners vuln \
  --format json --output /output/image.json
node scripts/image-policy.mjs tests/artifacts/security/image.json | tee tests/artifacts/security/policy.json
