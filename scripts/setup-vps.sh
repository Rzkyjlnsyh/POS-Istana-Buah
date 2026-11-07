#!/usr/bin/env bash
# ==============================================================================
# Provisioning Otomatis Ubuntu 22.04 LTS VPS — Istana Buah POS
# ENV-005 (Firewall UFW, Docker + Compose, Certbot SSL, Cron Backup Harian)
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Jalankan script ini sebagai root (sudo bash scripts/setup-vps.sh)" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/istana-buah}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/istanabuah}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/uploads/istanabuah}"
LOG_DIR="${LOG_DIR:-/var/log/istanabuah}"
TIMEZONE="${TIMEZONE:-Asia/Jakarta}"
SSH_PORT="${SSH_PORT:-22}"
BACKUP_CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
APP_DOMAIN="${APP_DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"

export DEBIAN_FRONTEND=noninteractive

echo "[1/5] Memperbarui paket sistem Ubuntu & mengatur timezone (${TIMEZONE})..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban cron certbot git
timedatectl set-timezone "${TIMEZONE}" || true

echo "[2/5] Mengonfigurasi firewall UFW (SSH ${SSH_PORT}, HTTP 80, HTTPS 443)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "[3/5] Menginstal Docker Engine & Docker Compose Plugin..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "[4/5] Menyiapkan direktori aplikasi, penyimpanan, dan sertifikat SSL..."
mkdir -p "${APP_DIR}" "${BACKUP_DIR}" "${UPLOADS_DIR}" "${LOG_DIR}"
chmod 750 "${BACKUP_DIR}"

if [ -n "${LETSENCRYPT_EMAIL}" ] && [ -n "${APP_DOMAIN}" ] && [ -n "${API_DOMAIN}" ]; then
  certbot certonly --standalone --non-interactive --agree-tos \
    -m "${LETSENCRYPT_EMAIL}" \
    -d "${APP_DOMAIN}" \
    --keep-until-expiring
  certbot certonly --standalone --non-interactive --agree-tos \
    -m "${LETSENCRYPT_EMAIL}" \
    -d "${API_DOMAIN}" \
    --keep-until-expiring
fi

echo "[5/5] Mendaftarkan jadwal backup otomatis PostgreSQL (${BACKUP_CRON_SCHEDULE})..."
CRON_FILE="/etc/cron.d/istanabuah-backup"
cat > "${CRON_FILE}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${BACKUP_CRON_SCHEDULE} root ${APP_DIR}/scripts/backup.sh >> ${LOG_DIR}/backup.log 2>&1
EOF
chmod 0644 "${CRON_FILE}"
systemctl enable --now cron

echo "Provisioning VPS selesai. Docker: $(docker --version) | Compose: $(docker compose version)"

