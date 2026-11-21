FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS node
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
