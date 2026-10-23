FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci --no-audit --no-fund
COPY . .
ENV VITE_BACKEND_URL=""
RUN npm run build
FROM nginx:1.28.0-alpine
COPY --from=build /app/dist /usr/share/nginx/html
