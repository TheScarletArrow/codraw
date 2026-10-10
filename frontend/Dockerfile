# Frontend image: nginx serves the app and proxies the API and sync from the same origin.
# The context is the root of the repository, which holds the lockfile of the pnpm workspace.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
# Manifests of every package of the workspace: pnpm checks the whole lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY frontend/package.json frontend/
COPY collab/package.json collab/
COPY e2e/package.json e2e/
COPY load/package.json load/
RUN pnpm install --frozen-lockfile --filter @codraw/frontend
COPY frontend frontend
RUN pnpm --filter @codraw/frontend build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# Where nginx sends the API and sync; the defaults are the services of docker-compose.prod.yml. The resolvers of the
# container (NGINX_LOCAL_RESOLVERS) find them again when they are recreated.
ENV BACKEND_URL=http://backend:8080 COLLAB_URL=http://collab:1234 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY frontend/nginx/security-headers.conf /etc/nginx/codraw/security-headers.conf
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
# Every participant of a board holds two connections of nginx, from the browser and to collab. The default of 1024 per
# worker, with a worker per core, would let a server of one core take about 500 participants (docs/load-testing.md).
RUN sed -i 's/worker_connections  1024;/worker_connections  4096;/' /etc/nginx/nginx.conf \
    && grep -q 'worker_connections  4096;' /etc/nginx/nginx.conf
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
