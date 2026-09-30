# syntax=docker/dockerfile:1.7
FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS prepare
WORKDIR /source
COPY . .
RUN node --test tests/unit/*.test.mjs
ARG SOURCE_DATE_EPOCH
RUN SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" node scripts/prepare.mjs /source "/prepared/$SOURCE_DATE_EPOCH" > /inventory.json

FROM ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine-slim@sha256:e28dcf0a161ddcbf228c7364b4a14f9bad4763ae8f5317c437b896afa3df4b84
ARG VCS_REF
ARG SOURCE_DATE_EPOCH
LABEL org.opencontainers.image.title="codedoodles-assets" \
      org.opencontainers.image.source="https://github.com/treyturner/codedoodl.es-doodles" \
      org.opencontainers.image.revision="$VCS_REF"
COPY container/nginx.conf /etc/nginx/nginx.conf
# COPY ignores mtime changes in its cache key. Including the epoch in the source
# path prevents old Last-Modified values surviving a later commit's cached build.
COPY --from=prepare /prepared/${SOURCE_DATE_EPOCH}/ /srv/artwork/
COPY --from=prepare /inventory.json /opt/codedoodles/inventory.json
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
