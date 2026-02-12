# Multi-stage build for Rota Manager
# Single container serving both API and web frontend

# Stage 1: Build everything
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

# Copy all package files for workspace resolution
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/web/package*.json ./packages/web/

# Install all dependencies
RUN npm ci

# Copy source files
COPY packages/api ./packages/api
COPY packages/web ./packages/web
COPY tsconfig.base.json ./

# Generate Prisma client
RUN npm run prisma:generate --workspace api

# Build API
RUN npm run build --workspace api

# Build web (set API base URL to empty for same-origin requests)
ENV VITE_API_BASE_URL=""
RUN npm run build --workspace web

# Stage 2: Production runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install OpenSSL for Prisma runtime and wget for health checks
RUN apk add --no-cache openssl wget

# Copy all package files
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/

# Install production dependencies (need tsx for seeding)
RUN npm ci --workspace api

# Copy Prisma schema and migrations
COPY packages/api/prisma ./packages/api/prisma
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma

# Copy built API
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy built web assets
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /data

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL=file:/data/rota.db
ENV CORS_ORIGIN=*
ENV SERVE_STATIC=true

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the application
ENTRYPOINT ["/docker-entrypoint.sh"]
