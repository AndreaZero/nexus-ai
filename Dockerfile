# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/ui packages/ui
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile --filter @nexus-ai/server... --filter @nexus-ai/web...
ARG VITE_NEXUS_SERVER_URL
RUN test -n "$VITE_NEXUS_SERVER_URL"
ENV VITE_NEXUS_SERVER_URL=$VITE_NEXUS_SERVER_URL
RUN pnpm --filter @nexus-ai/contracts build && pnpm --filter @nexus-ai/db build && pnpm --filter @nexus-ai/ui build && pnpm --filter @nexus-ai/web build && pnpm --filter @nexus-ai/server build

# Same Debian release as Node; pg_dump/pg_restore 18 are available to the operator.
FROM postgres:18.6-bookworm AS runtime
RUN apt-get update && apt-get install --yes --no-install-recommends libstdc++6 ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 nexus && useradd --uid 10001 --gid nexus --create-home nexus
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=nexus:nexus /app /app
ENV NODE_ENV=production NEXUS_SERVER_HOST=0.0.0.0 NEXUS_SERVER_PORT=3001
USER nexus
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(8000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["node"]
CMD ["apps/server/dist/index.js"]
