#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
export ASSETS_IMAGE="${1:?Usage: test-image.sh IMAGE}"
export TEST_RESULTS_DIR="${TEST_RESULTS_DIR:-$PWD/tests/artifacts}"
mkdir -p "$TEST_RESULTS_DIR"
TEST_RESULTS_DIR="$(cd "$TEST_RESULTS_DIR" && pwd)"
export TEST_RESULTS_DIR
source tests/integration.lock
bash tests/checkout-fixtures.sh
export SITE_IMAGE="codedoodles-assets-site:$SITE_COMMIT"
export RUNNER_IMAGE="codedoodles-assets-runner:local"
docker build -t "$SITE_IMAGE" tests/fixtures/site > "$TEST_RESULTS_DIR/site-build.log" 2>&1
docker build -t "$RUNNER_IMAGE" tests > "$TEST_RESULTS_DIR/runner-build.log" 2>&1
mkdir -p "$TEST_RESULTS_DIR/certs"
docker run --rm -v "$TEST_RESULTS_DIR/certs:/certs" "$RUNNER_IMAGE" openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /certs/key.pem -out /certs/cert.pem -days 2 -subj /CN=doodle.treyturner.info \
  -addext 'subjectAltName=DNS:doodle.treyturner.info,DNS:doodles.treyturner.info' \
  > "$TEST_RESULTS_DIR/certificate.log" 2>&1
project="codedoodles-assets-$(date +%s)-$$"
compose=(docker compose -p "$project" -f tests/compose.yml)
cleanup() {
  result=$?
  trap - EXIT
  "${compose[@]}" logs --no-color > "$TEST_RESULTS_DIR/containers.log" 2>&1 || true
  "${compose[@]}" down --timeout 5 --remove-orphans > "$TEST_RESULTS_DIR/cleanup.log" 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"${compose[@]}" create assets site tls
container="$("${compose[@]}" ps -a -q assets)"
docker cp "$container:/opt/codedoodles/inventory.json" "$TEST_RESULTS_DIR/inventory.json"
docker inspect "$container" > "$TEST_RESULTS_DIR/container.json"
[[ "$(docker inspect --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}}' "$container")" == '101:101 true' ]]
"${compose[@]}" start assets tls
"${compose[@]}" run --rm runner node wait.mjs http://assets:8080/health
"${compose[@]}" run --rm runner node wait.mjs https://doodle.treyturner.info/health
"${compose[@]}" start site
"${compose[@]}" run --rm runner node wait.mjs https://doodles.treyturner.info/health
"${compose[@]}" run --rm runner npm test
"${compose[@]}" exec -T assets test -w /tmp
"${compose[@]}" exec -T assets sh -c '! touch /srv/artwork/should-not-write'
"${compose[@]}" stop --timeout 10 assets
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" == 0 ]]
"${compose[@]}" start assets
"${compose[@]}" run --rm runner node wait.mjs http://assets:8080/health
for attempt in {1..20}; do
  [[ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" == healthy ]] && break
  sleep 1
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" == healthy ]]
docker image inspect "$ASSETS_IMAGE" > "$TEST_RESULTS_DIR/image.json"
echo 'PASS: non-root/read-only runtime, health, shutdown and restart'
