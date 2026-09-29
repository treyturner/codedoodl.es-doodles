# codedoodl.es artwork archive

This fork preserves the artwork used by [doodles.treyturner.info](https://doodles.treyturner.info)
and its [locally installed Chrome extension](https://github.com/treyturner/codedoodl.es-chrome-extension).
The `codedoodles-assets` image serves the 76 published sketches at the existing
`doodle.treyturner.info` paths. It is independent of the site application.

## Build and run

Requires Git, Docker with BuildKit and Compose, and Linux AMD64. Node 24.21.0 is
pinned for build/test tooling; the running server contains no Node runtime.

```sh
bash scripts/build-image.sh codedoodles-assets:local
docker compose up -d
curl http://127.0.0.1:8080/health
```

The wrapper supplies the source commit and its timestamp. Build from a clean
checkout when recording a release. The multi-stage Dockerfile pins Node and
unprivileged Nginx 1.30.5 Alpine slim by digest. The container runs as UID/GID
101:101, accepts HTTP on port 8080, and works with a read-only filesystem and
`/tmp` tmpfs. Logs go to stdout/stderr. Compose binds only loopback; the existing
reverse proxy remains responsible for HTTPS.

For deployment, set `ASSETS_IMAGE` to an accepted **registry digest**, not a
moving tag. See [publication and rollout](docs/deployment.md).

## Asset preparation and serving contract

`scripts/prepare.mjs` uses Node's standard library. The production
`master_manifest.json` is the allowlist: it copies each selected sketch directory
including `_original` resources, plus both root master manifests. Every DEV entry
must be included in production. Catalogue IDs, numbers, dates and surviving bytes
are preserved. Unpublished sketches, experiments, hidden metadata/editor files,
and repository-level build/test tooling are excluded from the served tree.

Many archived files contain gzip bytes despite their ordinary filename. The
preparer detects the signature, writes decoded bytes to the original filename,
and retains the exact archived bytes in a `.gz` companion. Other bytes stay
unchanged. Nothing rewrites the source archive. Corrupt gzip, invalid catalogues,
missing entrypoints/manifests/previews, unsafe paths and symlinks fail the build.
Files and directories receive the source commit timestamp; both representations
share their modification time. An internal inventory records sizes and SHA-256
hashes. Nginx negotiates gzip with `gzip_static`; direct companion URLs are hidden.

| Response | Cache-Control |
| --- | --- |
| HTML, both master manifests, each sketch's manifest | `no-cache` |
| Other successful assets (including previews, fonts, shaders and scripts) | `public, max-age=86400` |
| Health and errors | `no-store` |

ETag and Last-Modified support revalidation. Negotiated responses vary on
Accept-Encoding. Directory and explicit `index.html` URLs, HEAD and video ranges
are supported; directories without an index and missing/excluded paths return
404. No directory listing or SPA fallback is enabled. Responses permit public
cross-origin reads without credentials. No iframe restriction is added, so the
site and extension can embed artwork; the external proxy must preserve this.

Range requests use a loopback-only static listener inside the same Nginx process.
This lets the public listener apply cache/CORS headers after Nginx determines the
final 206 or 416 status; invalid ranges cannot inherit successful asset caching.

**There is no `immutable` policy.** Repaired scripts/media reuse filenames and may
remain in returning visitors' caches for up to 24 hours. Rolling back an image
does not immediately invalidate those browser caches. HTML and catalogues always
revalidate; this change does not add offline extension storage.

## Validation

```sh
node --test tests/unit/*.test.mjs tests/publish/*.test.mjs
bash tests/publish/check-credentials.sh
bash scripts/build-image.sh codedoodles-assets:local
bash scripts/test-image.sh codedoodles-assets:local
bash scripts/scan-image.sh codedoodles-assets:local
bash scripts/describe-image.sh codedoodles-assets:local
npm audit --prefix tests --audit-level=high
```

Use the pinned Node version for host commands. Building the image runs unit
tests inside its pinned builder. The integration wrapper checks out exact merged
site/extension commits from `tests/integration.lock`, builds them unchanged, and
runs HTTP and Chromium/installed-extension tests in a pinned Playwright container.
Do not change those clients' historical suites here. Update the fixture pins
deliberately when testing a newer client.

The candidate, real clients and a local TLS proxy share an isolated Docker
network. Both production hostnames resolve to that proxy **only inside this test
network**. Self-signed certificate handling is test-only; extension packages and
permissions remain unchanged. Tests exercise every packaged byte and gzip
companion, all 76 entrypoints/manifests/previews, MIME types, caching, validators,
ranges, exclusions, health and runtime restart. Browser tests cover Substrate,
Particulate, Canvas/WebGL, preview seeking, refresh, input and real HTTP cache hits
without request interception. Results and failure traces are in ignored
`tests/artifacts/`; test certificates are excluded from CI artifacts.

External checks are separate: `node scripts/smoke-host.mjs https://doodle.treyturner.info`
checks the currently exposed archive without expecting the new health/cache
contract. Add `--candidate` when validating this image through an HTTPS proxy.
External-service failures are reported separately from deterministic tests.

Runtime scans block unaccepted high/critical findings. The exception list starts
empty; any future exception must be narrow, owned, time-limited and without an
available fix. The tested image is saved with a checksum in CI artifacts even
when publication credentials are unavailable. Size reporting distinguishes
uncompressed layers from compressed registry-transfer layers; actual transfers
can be smaller when the host already has layers.

## Archive repairs and maintenance boundaries

Substrate's `xp-substrate` host has explicit block layout and positioning so its
canvas has a usable size without the original Shadow DOM styling behavior.
Particulate derives its route base from its script URL and accepts directory and
`index.html` entrypoints, including the site's `/__doodles/` development mount.
Both repaired files retain gzip encoding under their original filenames.

Fury Ribbons (`samsy/fury-ribbons`, #073) was removed from both catalogues because
the archive had only an unresolved submodule pointer with no artwork or source
URL. Boobs (`samsy/boobs`, #074) is unpublished by editorial choice; its source
remains in Git but is not in the image. The remaining entries retain their original
IDs/numbers, preserving the site's existing shortlink destinations.

This container does not update artwork libraries, promise all historical sketches
work on every GPU/browser, deploy production, or alter extension distribution.
