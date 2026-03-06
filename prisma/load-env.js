const { resolve } = require('path');
const { existsSync, readFileSync } = require('fs');

const env = process.env.NODE_ENV || 'development';
const envFiles = [
  `.env.${env}.local`,
  `.env.${env}`,
  '.env.local',
  '.env',
];

for (const file of envFiles) {
  const filePath = resolve(__dirname, '..', file);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

console.log(`[Prisma] Ambiente: ${env}`);
console.log(`[Prisma] DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@')}`);
