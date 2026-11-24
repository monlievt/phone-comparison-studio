// apps/web/src/lib/env-file.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function getEnvPath(): string {
  const rootDir = process.cwd().includes('apps/web')
    ? join(process.cwd(), '../..')
    : process.cwd();
  return join(rootDir, '.env');
}

export function readEnvVars(): Record<string, string> {
  const envPath = getEnvPath();
  try {
    const content = readFileSync(envPath, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        const commentIdx = val.indexOf('#');
        if (commentIdx !== -1) {
          val = val.slice(0, commentIdx).trim();
        }
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function updateEnvVars(updates: Record<string, string>): void {
  const envPath = getEnvPath();
  let content = '';
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    content = '';
  }

  const lines = content.split('\n');
  const handledKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      if (key in updates) {
        handledKeys.add(key);
        const commentIdx = line.indexOf('#');
        const comment = commentIdx !== -1 ? '  ' + line.slice(commentIdx) : '';
        return `${key}=${updates[key]}${comment}`;
      }
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!handledKeys.has(k)) {
      newLines.push(`${k}=${v}`);
    }
  }

  writeFileSync(envPath, newLines.join('\n'), 'utf-8');

  // Update in-memory process.env
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }
}
