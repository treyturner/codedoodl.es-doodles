# Publication, host validation and rollback

## CI and credentials

Pull requests to `master`, pushes to `master`, and manual runs validate a Linux
AMD64 candidate on Ubuntu 26.04. Actions, builder, server, browser runner, scanner
and client fixtures are pinned. All checks and the runtime vulnerability gate must
pass before publication. Pull requests never publish. Manual validation defaults
to artifacts only; choose `publish: true` to publish the tested candidate.

The repository needs `FORGEJO_REGISTRY_TOKEN`, with package write permission for
`treyturner/codedoodles-assets` on Forgejo. GHCR uses the workflow's `GITHUB_TOKEN`
with `packages: write`. Both credentials are asserted, then both registry logins
must succeed, before any push. Missing secrets fail publication rather than
silently skipping a destination. Secret-list access returned HTTP 403 during
implementation, so the Forgejo secret's presence must be confirmed by the owner
or the first authorized publishing run. Never put registry tokens in source.

A successful `master` push or explicit manual publication tags the **already
tested local image**, without rebuilding:

```text
ghcr.io/treyturner/codedoodles-assets:candidate-COMMIT-RUN-ATTEMPT
forgejo.treyturner.info/treyturner/codedoodles-assets:candidate-COMMIT-RUN-ATTEMPT
```

Both remote digests are recorded and must match. The run's artifact includes the
tested image archive/checksum, byte inventory, size report, HTTP/browser results,
runtime logs and scan report. The registry digests, once published, are the
authoritative deployment references. A local OCI digest alone is not a claim
that the image is available from a registry. Network failures can leave one mirror
published; the run fails and does not promote `latest`.

New workflow files must first exist on the default branch for GitHub's manual
workflow UI to offer them. Merging this PR enables the normal `master` publication
path; PR validation still supplies a locally loadable candidate beforehand.

## Staged rollout

1. Retain the current Apache configuration and the archive it serves. Record the
   previous backend address and any previously accepted image digest. Do not
   replace or delete that archive as part of validation.
2. Download the tested candidate by the recorded registry digest, or load the
   checksum-verified CI image archive for pre-publication testing. Start it
   separately on an unused loopback port, for example:

   ```sh
   export ASSETS_IMAGE='forgejo.treyturner.info/treyturner/codedoodles-assets@sha256:REPLACE_WITH_VERIFIED_DIGEST'
   export ASSETS_PORT=18080
   docker compose -p codedoodles-assets-candidate up -d
   curl --fail http://127.0.0.1:18080/health
   ```

   For the pre-publication CI artifact, verify and load it first, then use the
   local tag recorded in its size report instead of a registry reference:

   ```sh
   sha256sum -c candidate-image.tar.gz.sha256
   docker image load --input candidate-image.tar.gz
   export ASSETS_IMAGE="$(jq -r .image candidate-image.json)"
   ```

3. Validate through an isolated HTTPS proxy route or local DNS override using the
   existing archive hostname. Keep production traffic on the previous backend.
   Preserve paths, Range, Accept-Encoding, validators, CORS and response cache
   headers. Remove the old blanket gzip header rule: this image negotiates gzip
   and identity itself. Do not add iframe-blocking headers. Check the site and
   installed extension, Substrate/Particulate, representative Canvas/WebGL,
   preview playback/seeking, refresh and input. Run the external smoke tool with
   `--candidate` against the validation endpoint. Also confirm /health is not
   cached by the proxy.
4. Only after host validation, change the archive proxy's upstream to the candidate
   port. Keep `doodle.treyturner.info`, all published paths, the site backend and
   extension configuration unchanged. Monitor HTTP errors and artwork/previews.
   Production deployment is an operator action, not a CI side effect.
5. Optionally promote the accepted candidate to `latest` using **Promote tested
   artwork candidate**, running on `master`. Supply its complete candidate tag,
   the exact validated `sha256:` digest, and `host_validated: true`. The workflow
   checks source inclusion in `master`, asserts both credentials, checks both
   registries against the supplied digest before changing either, and copies that
   digest to `latest` without rebuilding. It verifies both resulting digests.
   Deployments should continue to use immutable digest references.

Promotion can be inspected without writes using:

```sh
git fetch origin master
bash scripts/promote-image.sh treyturner CANDIDATE_TAG sha256:DIGEST --dry-run
```

## Rollback

Switch only the archive proxy upstream back to the retained Apache backend, or
restart the service with the previously accepted immutable image digest. Verify
entrypoints and previews through HTTPS again. No catalogue renumbering, source
migration, or extension release is required. Retain the failed candidate and logs
for diagnosis until the incident is understood.

Browser caches are independent of backend rollback: scripts/media can remain
cached for 24 hours. A fresh browser profile or disabled cache can confirm the
restored server immediately, but existing users' cached bytes expire naturally.
