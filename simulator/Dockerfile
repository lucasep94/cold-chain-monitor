# Build context: repository root (pnpm workspace + lockfile live there).
#   docker build -f simulator/Dockerfile .

FROM node:22-alpine AS build
RUN npm install -g pnpm@11.1.3
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json api/
COPY simulator/package.json simulator/
RUN pnpm install --frozen-lockfile --filter simulator
COPY tsconfig.base.json ./
COPY simulator/tsconfig.json simulator/tsconfig.build.json simulator/
COPY simulator/src simulator/src
RUN pnpm --filter simulator build

# No runtime dependencies: only the compiled output is needed.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node simulator/package.json ./
COPY --from=build --chown=node:node /app/simulator/dist ./dist
USER node
# keys.json is mounted at /app/keys.json (see docker-compose.yml).
ENTRYPOINT ["node", "dist/index.js"]
