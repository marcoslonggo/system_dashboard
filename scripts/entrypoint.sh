#!/bin/sh
set -e

# If a volume is mounted at /app/prisma and it's empty, seed it with the bundled schema.
if [ ! -f /app/prisma/schema.prisma ]; then
  echo "[entrypoint] Seeding prisma schema into /app/prisma"
  mkdir -p /app/prisma
  cp -r /app/prisma-template/. /app/prisma/
fi

echo "[entrypoint] Running prisma migrate deploy"
if ! npx prisma migrate deploy --schema=/app/prisma/schema.prisma; then
  echo "[entrypoint] migrate deploy failed, attempting prisma db push"
  if ! npx prisma db push --schema=/app/prisma/schema.prisma; then
    echo "[entrypoint] prisma db push failed; proceeding without DB migration"
  fi
fi

echo "[entrypoint] Starting Next.js server"
exec node server.js
