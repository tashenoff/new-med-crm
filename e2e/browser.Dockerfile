FROM node:22.20.0-bookworm-slim
RUN http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" apt-get update && http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /tests
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci --no-audit --no-fund
RUN mkdir /artifacts
