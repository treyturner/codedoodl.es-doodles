#!/usr/bin/env bash
set -euo pipefail

require_value() {
  if [[ -z "$1" ]]; then
    echo "::error::$2 is required for $3 publication; no images were pushed." >&2
    exit 1
  fi
}

selected=0
while IFS= read -r ref; do
  [[ -n "$ref" ]] || continue
  selected=1
  case "$ref" in
    ghcr.io/*)
      require_value "${GITHUB_TOKEN:-}" 'github-token' 'GHCR'
      ;;
    forgejo.treyturner.info/*)
      require_value "${FORGEJO_TOKEN:-}" 'FORGEJO_REGISTRY_TOKEN (forgejo-token)' 'Forgejo'
      ;;
    docker.io/*)
      require_value "${DOCKERHUB_USERNAME:-}" 'dockerhub-username' 'DockerHub'
      require_value "${DOCKERHUB_PASSWORD:-}" 'dockerhub-password' 'DockerHub'
      ;;
    *)
      echo '::error::Unsupported publication registry; no images were pushed.' >&2
      exit 1
      ;;
  esac
done <<< "${REFS_RAW:-}"
[[ "$selected" == 1 ]] || { echo '::error::At least one publication ref is required.' >&2; exit 1; }
