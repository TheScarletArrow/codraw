# Collab image; the context is the root of the repository, which holds the lockfile of the pnpm workspace.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
# Manifests of every package of the workspace: pnpm checks the whole lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY collab/package.json collab/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
COPY load/package.json load/
RUN pnpm install --frozen-lockfile --filter @codraw/collab
COPY collab/tsconfig.json collab/tsconfig.build.json collab/
COPY collab/src collab/src
RUN pnpm --filter @codraw/collab build \
    && pnpm --filter @codraw/collab deploy --prod --legacy /deploy

FROM node:24-alpine
# The fixes of the packages of Alpine that came after the base image; npm, corepack and yarn of the image, which collab
# does not run, go with their own dependencies. The day of the build (`--build-arg`) runs the upgrade again every day:
# otherwise the cache of layers in CI keeps the packages of the day the layer was made.
ARG CODRAW_UPGRADE_DAY
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production PORT=1234
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules node_modules
COPY --from=build /workspace/collab/dist dist
USER node
EXPOSE 1234
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/index.js"]
