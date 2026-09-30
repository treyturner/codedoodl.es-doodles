#!/usr/bin/env bash
set -euo pipefail
owner="${1:?Usage: promote-image.sh OWNER CANDIDATE_TAG SHA256_DIGEST [--apply]}"
candidate="${2:?Candidate tag required}"
digest="${3:?Registry digest required}"
mode="${4:---dry-run}"
[[ "$owner" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo 'Invalid registry owner' >&2; exit 1; }
[[ "$candidate" =~ ^candidate-[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid candidate tag' >&2; exit 1; }
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid digest' >&2; exit 1; }
[[ "$mode" == --apply || "$mode" == --dry-run ]] || { echo 'Use --dry-run or --apply' >&2; exit 1; }
[[ "${GITHUB_REF:-refs/heads/master}" == refs/heads/master ]] || { echo 'Promotion requires master' >&2; exit 1; }
commit="${candidate#candidate-}"
commit="${commit%%-*}"
git merge-base --is-ancestor "$commit" origin/master || { echo 'Candidate source must be included in origin/master' >&2; exit 1; }
repositories=("ghcr.io/$owner/codedoodles-assets" "forgejo.treyturner.info/$owner/codedoodles-assets")
remote_digest() { docker buildx imagetools inspect "$1" --format '{{json .Manifest}}' | node -e 'let text="";process.stdin.on("data",chunk=>text+=chunk).on("end",()=>{const digest=JSON.parse(text).digest;if(!/^sha256:[a-f0-9]{64}$/.test(digest))process.exit(1);console.log(digest)})'; }
# Check both mirrors before changing either; a tag mismatch cannot select new bytes.
for repository in "${repositories[@]}"; do
  actual="$(remote_digest "$repository:$candidate")"
  [[ "$actual" == "$digest" ]] || { echo "Candidate digest mismatch at $repository" >&2; exit 1; }
done
for repository in "${repositories[@]}"; do
  if [[ "$mode" == --dry-run ]]; then
    echo "Would promote $repository@$digest to $repository:latest"
  else
    docker buildx imagetools create --prefer-index=false --tag "$repository:latest" "$repository@$digest"
    [[ "$(remote_digest "$repository:latest")" == "$digest" ]] || { echo "Promotion verification failed at $repository" >&2; exit 1; }
    echo "Promoted $repository@$digest"
  fi
done
