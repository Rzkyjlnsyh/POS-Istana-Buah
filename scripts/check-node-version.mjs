/**
 * Verifikasi versi Node.js (ENV-001: "Node versi terverifikasi").
 * Minimum diambil dari `engines.node` di package.json root — bukan angka hardcode.
 */
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const range = pkg.engines?.node ?? '';
const match = /(\d+)/.exec(range);

if (!match) {
  console.error('engines.node tidak ditemukan di package.json');
  process.exit(1);
}

const requiredMajor = Number(match[1]);
const currentMajor = Number(process.versions.node.split('.')[0]);

if (currentMajor < requiredMajor) {
  console.error(`Node ${process.versions.node} terlalu lama. Dibutuhkan ${range} (LTS 20+).`);
  process.exit(1);
}

console.log(`OK: Node ${process.versions.node} memenuhi syarat (${range})`);
