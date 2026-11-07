#!/usr/bin/env bash
# ==============================================================================
# Automated PostgreSQL & Uploads Backup — Istana Buah POS
# ENV-005 / Bagian 13.6 (Jadwal cron harian: 0 2 * * *)
# ==============================================================================
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker/docker-compose.yml}"
DOCKER_ENV_FILE="${DOCKER_ENV_FILE:-${REPO_ROOT}/docker/.env}"

if [ -f "${DOCKER_ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${DOCKER_ENV_FILE}"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/istanabuah}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
POSTGRES_DB="${POSTGRES_DB:-istanabuah}"
POSTGRES_USER="${POSTGRES_USER:?Environment POSTGRES_USER wajib diisi}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/uploads/istanabuah}"
DATE_STAMP="$(date +%Y%m%d_%H%M%S)"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose -f "${COMPOSE_FILE}")
else
  COMPOSE_CMD=(docker-compose -f "${COMPOSE_FILE}")
fi

mkdir -p "${BACKUP_DIR}"

DB_ARCHIVE="${BACKUP_DIR}/db_${DATE_STAMP}.sql.gz"
"${COMPOSE_CMD[@]}" exec -T postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-acl \
  --no-owner \
  | gzip > "${DB_ARCHIVE}"

if [ ! -s "${DB_ARCHIVE}" ]; then
  echo "ERROR: Hasil backup database kosong (${DB_ARCHIVE})" >&2
  rm -f "${DB_ARCHIVE}"
  exit 1
fi

if [ -d "${UPLOADS_DIR}" ]; then
  tar -czf "${BACKUP_DIR}/uploads_${DATE_STAMP}.tar.gz" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"
fi

find "${BACKUP_DIR}" -type f -name "*.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup selesai: ${DATE_STAMP} -> ${DB_ARCHIVE}"

