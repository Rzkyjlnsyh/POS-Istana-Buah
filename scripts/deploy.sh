#!/usr/bin/env bash
# ==============================================================================
# Automated Zero-Downtime Rolling Deployment — Istana Buah POS
# ENV-005 / Bagian 13.4
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker/docker-compose.yml}"
DOCKER_ENV_FILE="${DOCKER_ENV_FILE:-${REPO_ROOT}/docker/.env}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-12}"
HEALTHCHECK_INTERVAL_SEC="${HEALTHCHECK_INTERVAL_SEC:-5}"

if [ -f "${DOCKER_ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${DOCKER_ENV_FILE}"
  set +a
fi

API_PORT_EFFECTIVE="${API_PORT:-3000}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:${API_PORT_EFFECTIVE}/health}"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose -f "${COMPOSE_FILE}" --env-file "${DOCKER_ENV_FILE}")
else
  COMPOSE_CMD=(docker-compose -f "${COMPOSE_FILE}")
fi

echo "Memulai deployment Istana Buah POS (branch: ${DEPLOY_BRANCH})..."

cd "${REPO_ROOT}"
git fetch origin "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git pull --ff-only origin "${DEPLOY_BRANCH}"

"${COMPOSE_CMD[@]}" up -d postgres redis
"${COMPOSE_CMD[@]}" build --pull api web

"${COMPOSE_CMD[@]}" up -d --no-deps api
"${COMPOSE_CMD[@]}" exec -T api ./node_modules/.bin/prisma migrate deploy

ATTEMPT=1
until curl -fsS "${HEALTHCHECK_URL}" >/dev/null; do
  if [ "${ATTEMPT}" -ge "${HEALTHCHECK_RETRIES}" ]; then
    echo "ERROR: Health check gagal setelah ${HEALTHCHECK_RETRIES} percobaan (${HEALTHCHECK_URL})" >&2
    exit 1
  fi
  echo "Menunggu API sehat (${ATTEMPT}/${HEALTHCHECK_RETRIES})..."
  ATTEMPT=$((ATTEMPT + 1))
  sleep "${HEALTHCHECK_INTERVAL_SEC}"
done

"${COMPOSE_CMD[@]}" up -d --no-deps web
docker image prune -f >/dev/null 2>&1 || true

echo "Deployment berhasil diverifikasi pada ${HEALTHCHECK_URL}"

