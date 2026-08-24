# ============================================
# BUILD STAGE
# ============================================
FROM node:22-alpine AS build

WORKDIR /app

# Installer Bun
RUN npm install -g bun

# Copier les fichiers de dépendances
COPY package.json bun.lock ./

# Installer exactement les dépendances du lockfile
RUN bun install --frozen-lockfile

# Copier le code source
COPY . .

# Build de l'application
RUN bun run build


# ============================================
# RUNTIME STAGE
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Installer Bun
RUN npm install -g bun

# Copier les fichiers de dépendances
COPY package.json bun.lock ./

# Installer uniquement les dépendances production
RUN bun install --frozen-lockfile --production \
    && bun pm cache rm

# Copier les fichiers nécessaires à l'exécution
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/docker-entrypoint.cjs ./docker-entrypoint.cjs

# Utilisateur non-root
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "docker-entrypoint.cjs"]
