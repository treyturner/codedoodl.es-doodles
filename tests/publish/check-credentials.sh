#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
check="$repo_dir/.github/actions/publish/check-credentials.sh"
# These are test placeholders; never use runner credentials or touch a registry.
export GITHUB_TOKEN=test-gh FORGEJO_TOKEN=test-forgejo DOCKERHUB_USERNAME=test-user DOCKERHUB_PASSWORD=test-password
export REFS_RAW=$'ghcr.io/test/image:latest\nforgejo.treyturner.info/test/image:latest\ndocker.io/test/image:latest'
bash "$check"
for variable in GITHUB_TOKEN FORGEJO_TOKEN DOCKERHUB_USERNAME DOCKERHUB_PASSWORD; do
  if output="$(env "$variable=" bash "$check" 2>&1)"; then
    echo "Missing $variable should prevent publication" >&2
    exit 1
  fi
  [[ "$output" == *'is required'* && "$output" == *'no images were pushed'* ]]
  [[ "$output" != *test-gh* && "$output" != *test-forgejo* && "$output" != *test-password* ]]
done
# A GHCR-only consumer need not configure unrelated registry credentials.
REFS_RAW=ghcr.io/test/image:latest FORGEJO_TOKEN= DOCKERHUB_USERNAME= DOCKERHUB_PASSWORD= bash "$check"
for refs in '' 'unknown.example/test/image:latest'; do
  if REFS_RAW="$refs" bash "$check" >/dev/null 2>&1; then
    echo 'Invalid refs should prevent publication' >&2
    exit 1
  fi
done
echo 'PASS: publication requires credentials for every selected registry, without exposing tokens'
