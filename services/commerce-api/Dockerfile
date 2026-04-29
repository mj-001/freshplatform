# syntax=docker/dockerfile:1.7

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Workspace manifests first for cache efficiency
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/commerce-api/package.json ./services/commerce-api/

RUN pnpm install --frozen-lockfile

# Source
COPY packages/shared-types ./packages/shared-types
COPY services/commerce-api ./services/commerce-api

RUN pnpm --filter @fresh-platform/shared-types build \
 && pnpm --filter @fresh-platform/commerce-api build \
 && pnpm --filter @fresh-platform/commerce-api deploy --prod /out

# ---- Runtime stage ----
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/migrations ./migrations

EXPOSE 8080
CMD ["dist/server.js"]
