# Collab image; the context is the root of the repository, which holds the lockfile of the pnpm workspace.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
# Manifests of every package of the workspace: pnpm checks the whole lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY collab/package.json collab/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @codraw/collab
COPY collab/tsconfig.json collab/tsconfig.build.json collab/
COPY collab/src collab/src
RUN pnpm --filter @codraw/collab build \
    && pnpm --filter @codraw/collab deploy --prod --legacy /deploy

FROM node:24-alpine
ENV NODE_ENV=production PORT=1234
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules node_modules
COPY --from=build /workspace/collab/dist dist
USER node
EXPOSE 1234
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/index.js"]
