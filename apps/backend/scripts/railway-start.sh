#!/usr/bin/env sh
# Railway sets RAILWAY_SERVICE_NAME per service (e.g. "workers", "backend").
# Both services share /apps/backend and railway.json — this script picks the right entrypoint.
SERVICE="${RAILWAY_SERVICE_NAME:-}"

case "$SERVICE" in
  *[Ww]orker*)
    echo "[railway-start] service=${SERVICE} → pnpm run start:workers"
    exec pnpm run start:workers
    ;;
  *)
    echo "[railway-start] service=${SERVICE} → pnpm run start:server"
    exec pnpm run start:server
    ;;
esac
