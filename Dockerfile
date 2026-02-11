# Multi-stage build for Rota Manager
# Single container serving both API and web frontend

# Stage 1: Build web frontend
FROM node:20-alpine AS web-builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/web/package*.json ./packages/web/

# Install dependencies
RUN npm ci --workspace web

# Copy web source and build
COPY packages/web ./packages/web

# Set API base URL to empty for same-origin requests in production
ENV VITE_API_BASE_URL=""
RUN npm run build --workspace web

# Stage 2: Build API
FROM node:20-alpine AS api-builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/

# Install dependencies (including dev for build)
RUN npm ci --workspace api

# Copy API source
COPY packages/api ./packages/api

# Generate Prisma client and build
RUN npm run prisma:generate --workspace api
RUN npm run build --workspace api

# Stage 3: Production runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/

# Install dependencies (need tsx for seeding)
RUN npm ci --workspace api

# Copy Prisma schema and migrations
COPY packages/api/prisma ./packages/api/prisma
RUN npx prisma generate --schema=packages/api/prisma/schema.prisma

# Copy built API
COPY --from=api-builder /app/packages/api/dist ./packages/api/dist

# Copy built web assets
COPY --from=web-builder /app/packages/web/dist ./packages/web/dist

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
