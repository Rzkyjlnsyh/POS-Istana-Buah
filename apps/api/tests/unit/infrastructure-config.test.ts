import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepoFile(relativePath: string): string {
  const fullPath = path.join(repoRoot, relativePath);
  expect(fs.existsSync(fullPath)).toBe(true);
  return fs.readFileSync(fullPath, 'utf8');
}

function findGitBash(): string | null {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    '/bin/bash',
    '/usr/bin/bash',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

describe('Infrastructure & CI/CD configuration (ENV-004 & ENV-005)', () => {
  it('menyediakan seluruh artefak infrastruktur sesuai struktur Bagian 5.4 & Bagian 13', () => {
    const requiredFiles = [
      '.dockerignore',
      '.github/dependabot.yml',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yml',
      'docker/.env.example',
      'docker/Dockerfile.api',
      'docker/Dockerfile.web',
      'docker/docker-compose.yml',
      'docker/nginx.conf',
      'scripts/backup.sh',
      'scripts/deploy.sh',
      'scripts/setup-vps.sh',
    ];

    for (const relPath of requiredFiles) {
      expect(fs.existsSync(path.join(repoRoot, relPath))).toBe(true);
    }
  });

  it('Dockerfile.api menggunakan multi-stage Node 20 Alpine, non-root user, dan healthcheck dinamis', () => {
    const dockerfileApi = readRepoFile('docker/Dockerfile.api');

    expect(dockerfileApi).toContain('FROM node:20-alpine AS builder');
    expect(dockerfileApi).toContain('FROM node:20-alpine AS runner');
    expect(dockerfileApi).toContain('USER node');
    expect(dockerfileApi).toContain('http://127.0.0.1:${PORT}/health');
    expect(dockerfileApi).toContain('CMD ["node", "dist/server.js"]');
  });

  it('Dockerfile.web menggunakan multi-stage Node 20 + Nginx Alpine dengan Vite build args', () => {
    const dockerfileWeb = readRepoFile('docker/Dockerfile.web');

    expect(dockerfileWeb).toContain('FROM node:20-alpine AS builder');
    expect(dockerfileWeb).toContain('FROM nginx:1.27-alpine AS runner');
    expect(dockerfileWeb).toContain('ARG VITE_API_BASE_URL');
    expect(dockerfileWeb).toContain('ARG VITE_APP_NAME');
    expect(dockerfileWeb).toContain('ARG VITE_OFFLINE_SYNC_INTERVAL');
    expect(dockerfileWeb).toContain('ARG VITE_PRODUCT_CACHE_TTL');
    expect(dockerfileWeb).toContain('HEALTHCHECK');
  });

  it('docker-compose.yml mendefinisikan api, web, postgres:16-alpine, redis:7-alpine tanpa secret hardcode', () => {
    const compose = readRepoFile('docker/docker-compose.yml');

    expect(compose).toContain('postgres:16-alpine');
    expect(compose).toContain('redis:7-alpine');
    expect(compose).toContain('${POSTGRES_USER}');
    expect(compose).toContain('${POSTGRES_PASSWORD}');
    expect(compose).toContain('${REDIS_PASSWORD}');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('postgres_data:');
    expect(compose).toContain('redis_data:');
    expect(compose).toContain('uploads:');
    expect(compose).toContain('logs:');
    expect(compose).toContain('certbot_etc:');
  });

  it('nginx.conf menerapkan HTTPS redirect, sertifikat Let’s Encrypt, SPA/SW rules, dan 6 security headers (Bagian 14.6)', () => {
    const nginx = readRepoFile('docker/nginx.conf');

    expect(nginx).toContain('return 301 https://$host$request_uri;');
    expect(nginx).toContain('/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem');
    expect(nginx).toContain('/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem');
    expect(nginx).toContain('ssl_protocols TLSv1.2 TLSv1.3;');

    // Enam security header wajib Bagian 14.6
    expect(nginx).toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains"');
    expect(nginx).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(nginx).toContain('X-Content-Type-Options "nosniff"');
    expect(nginx).toContain('X-XSS-Protection "1; mode=block"');
    expect(nginx).toContain('Referrer-Policy "no-referrer-when-downgrade"');
    expect(nginx).toContain('Content-Security-Policy');

    // PWA SPA fallback & Service Worker no-cache
    expect(nginx).toContain('try_files $uri $uri/ /index.html;');
    expect(nginx).toContain('location = /sw.js');
    expect(nginx).toContain('no-cache, no-store, must-revalidate');

    // Reverse proxy ke API tanpa hardcode port
    expect(nginx).toContain('proxy_pass http://api:${API_UPSTREAM_PORT};');
    expect(nginx).toContain('client_max_body_size ${CLIENT_MAX_BODY_SIZE};');
  });

  it('seluruh shell script menggunakan LF, strict mode bash, dan lulus validasi sintaks bash -n', () => {
    const scripts = ['scripts/backup.sh', 'scripts/deploy.sh', 'scripts/setup-vps.sh'];

    for (const relPath of scripts) {
      const content = readRepoFile(relPath);
      expect(content.startsWith('#!/usr/bin/env bash\n')).toBe(true);
      expect(content.includes('\r\n')).toBe(false);
      expect(content).toContain('set -euo pipefail');
    }

    const backupScript = readRepoFile('scripts/backup.sh');
    expect(backupScript).toContain('pg_dump');
    expect(backupScript).toContain('RETENTION_DAYS:-30');

    const deployScript = readRepoFile('scripts/deploy.sh');
    expect(deployScript).toContain('prisma migrate deploy');
    expect(deployScript).toContain('HEALTHCHECK_URL');

    const setupVpsScript = readRepoFile('scripts/setup-vps.sh');
    expect(setupVpsScript).toContain('ufw allow 80/tcp');
    expect(setupVpsScript).toContain('ufw allow 443/tcp');
    expect(setupVpsScript).toContain('docker-compose-plugin');
    expect(setupVpsScript).toContain('certbot');
    expect(setupVpsScript).toContain('0 2 * * *');

    const bashBin = findGitBash();
    if (bashBin) {
      execFileSync(bashBin, ['-n', ...scripts.map((relPath) => path.join(repoRoot, relPath))], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    }
  });
});
