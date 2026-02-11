#!/bin/sh
set -e

cd /app/packages/api

# Create/update database schema
echo "Setting up database schema..."
npx prisma db push --schema=prisma/schema.prisma --accept-data-loss

# Check if database needs seeding (marker file indicates seeding was done)
if [ ! -f /data/.seeded ]; then
  echo "Seeding database with initial data..."
  npx tsx prisma/seed.ts
  touch /data/.seeded
  echo "Seed complete!"
else
  echo "Database already seeded, skipping."
fi

cd /app

# Start the application
echo "Starting Rotato on port ${PORT:-3001}..."
exec node packages/api/dist/server.js
