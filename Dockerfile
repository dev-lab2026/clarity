FROM node:22-alpine AS build

WORKDIR /app

RUN npm install -g bun

COPY package.json ./

RUN bun install

COPY . .

RUN bun run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN npm install -g bun

COPY package.json ./

RUN bun install --production \
    && bun pm cache rm

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/docker-entrypoint.cjs ./docker-entrypoint.cjs

RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "docker-entrypoint.cjs"]
