FROM node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS node
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
COPY --from=node /usr/local/ /usr/local/
WORKDIR /extension
COPY fixtures/extension/package*.json ./
RUN npm ci --no-audit --no-fund
COPY fixtures/extension/ ./
RUN npm run build
WORKDIR /tests
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY http.test.mjs browser.spec.mjs playwright.config.mjs wait.mjs tls.mjs ./
CMD ["npm", "test"]
