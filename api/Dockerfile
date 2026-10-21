# Build context: repository root (pnpm workspace + lockfile live there).
#   docker build -f api/Dockerfile .

FROM node:22-alpine AS base
RUN npm install -g pnpm@11.1.3
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json api/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter api
COPY tsconfig.base.json ./
COPY api/tsconfig.json api/tsconfig.build.json api/
COPY api/src api/src
RUN pnpm --filter api build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/api/node_modules ./api/node_modules
COPY --from=build --chown=node:node /app/api/dist ./api/dist
COPY --chown=node:node api/package.json ./api/
USER node
WORKDIR /app/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
