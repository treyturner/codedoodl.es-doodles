#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
image="${1:?Usage: describe-image.sh IMAGE}"
mkdir -p build tests/artifacts
directory="$(mktemp -d "$PWD/build/describe.XXXXXX")"
trap 'rm -rf -- "$directory"' EXIT
docker image save "$image" -o "$directory/image.tar"
node scripts/describe-image.mjs "$image" "$directory/image.tar" | tee tests/artifacts/candidate-image.json
