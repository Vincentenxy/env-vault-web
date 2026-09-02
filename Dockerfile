ARG NODE_IMAGE=node:20-alpine
ARG NGINX_IMAGE=harbor.gtjaqh.net/infra/nginx:mainline

FROM ${NODE_IMAGE} AS builder

WORKDIR /app

RUN npm install --global pnpm@10.11.1

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY .env.production ./
COPY src ./src

# Run Vite first so its plugins generate the declaration files used by vue-tsc.
RUN pnpm exec vite build \
    && pnpm typecheck \
    && find dist -type f -name '*.map' -delete

FROM ${NGINX_IMAGE} AS runtime

ENV API_UPSTREAM=http://host.docker.internal:8090 \
    API_BOOTSTRAP_UPSTREAM=http://host.docker.internal:8090 \
    NGINX_ENVSUBST_FILTER=API_.*UPSTREAM

COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
