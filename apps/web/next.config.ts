import type { NextConfig } from 'next';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load root monorepo .env into server process.env (never into client bundle)
const rootEnvPath = join(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  const lines = readFileSync(rootEnvPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    const commentIdx = val.indexOf('#');
    if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();
    if (!process.env[key] && val) {
      process.env[key] = val;
    }
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: [],
};

export default nextConfig;
