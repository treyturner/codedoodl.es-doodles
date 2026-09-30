#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
source tests/integration.lock
checkout() {
  local name="$1" repository="$2" commit="$3" directory="tests/fixtures/$1"
  if [[ ! -d "$directory/.git" ]]; then
    mkdir -p "$directory"
    git init -q "$directory"
    git -C "$directory" remote add origin "$repository"
    git -C "$directory" fetch --no-tags --no-recurse-submodules --depth=1 origin "$commit"
    git -C "$directory" checkout -q --detach "$commit"
  fi
  [[ "$(git -C "$directory" rev-parse HEAD)" == "$commit" ]] || { echo "Wrong $name fixture revision" >&2; exit 1; }
  [[ -z "$(git -C "$directory" status --porcelain)" ]] || { echo "Dirty $name fixture; refusing to overwrite it" >&2; exit 1; }
}
checkout site "$SITE_REPOSITORY" "$SITE_COMMIT"
checkout extension "$EXTENSION_REPOSITORY" "$EXTENSION_COMMIT"
