# syntax=docker/dockerfile:1
FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build node node_modules/prisma/build/index.js generate --schema database/prisma/schema.prisma
RUN node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit && node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
RUN node tools/production/build.mjs && node node_modules/vite/bin/vite.js build apps/web --config apps/web/vite.config.ts

FROM node:24.18.0-bookworm-slim AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev --omit=optional --ignore-scripts --workspace=@ahmed-store/api --include-workspace-root && npm cache clean --force
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/dist/api /app/dist/api
USER node
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/api/main.mjs"]

FROM caddy:2.11.7-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

FROM postgres:17-bookworm AS operations
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=api /app/node_modules /app/node_modules
COPY --from=build /app/dist/ops /app/dist/ops
COPY deploy/backup-loop.sh /app/deploy/backup-loop.sh
RUN chmod +x /app/deploy/backup-loop.sh
ENTRYPOINT ["/app/deploy/backup-loop.sh"]
