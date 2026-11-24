// packages/core/src/config/settings.ts
// Persistent SQLite settings, brand image terms policy, SoC tiers loader, disk space check, and audit log.

import { readFileSync, existsSync, statfsSync } from 'fs';
import { join } from 'path';
import { Database } from '../db/database.js';
import {
  StudioSettings,
  StudioSettingsSchema,
  AutopilotSettings,
  BrandPolicy,
  BrandPolicySchema,
} from '../schemas/index.js';
import { z } from 'zod';

const DEFAULT_BRANDS: BrandPolicy[] = [
  { brand: 'Samsung', termsUrl: 'https://news.samsung.com/global/terms-and-conditions', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Apple', termsUrl: 'https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html', allowed: false, allowsModification: false, logoAllowed: false },
  { brand: 'Xiaomi', termsUrl: 'https://www.mi.com/global/about/terms', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'OPPO', termsUrl: 'https://www.oppo.com/en/terms-of-use/', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'OnePlus', termsUrl: 'https://www.oneplus.com/legal/terms-of-use', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Vivo', termsUrl: 'https://www.vivo.com/en/terms-of-use', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Realme', termsUrl: 'https://www.realme.com/en/terms', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Google', termsUrl: 'https://about.google/brand-resource-center/', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Nothing', termsUrl: 'https://nothing.tech/pages/terms-of-service', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Motorola', termsUrl: 'https://www.motorola.com/us/legal', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'POCO', termsUrl: 'https://www.po.co/global/about/terms', allowed: null, allowsModification: false, logoAllowed: false },
  { brand: 'Redmi', termsUrl: 'https://www.mi.com/global/about/terms', allowed: null, allowsModification: false, logoAllowed: false },
];

export function getSettingValue<T>(db: Database.Database, key: string): T | null {
  const row = db
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get(key) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

export function setSettingValue(db: Database.Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value_json)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
  ).run(key, JSON.stringify(value));
}

export function getStudioSettings(db: Database.Database): StudioSettings {
  const raw = getSettingValue<Record<string, unknown>>(db, 'studio_settings');
  const parsed = StudioSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    return parsed.data;
  }
  return StudioSettingsSchema.parse({});
}

export function saveStudioSettings(
  db: Database.Database,
  patch: Partial<{
    autopilot: Partial<AutopilotSettings>;
    excludedCategories: string[];
    lastMotionPreset: string | null;
    autopilotPaused: boolean;
    autopilotPauseReason: string | null;
    consecutiveFailures: number;
  }>
): StudioSettings {
  const current = getStudioSettings(db);
  const merged = StudioSettingsSchema.parse({
    ...current,
    ...patch,
    autopilot: {
      ...current.autopilot,
      ...(patch.autopilot ?? {}),
    },
  });
  setSettingValue(db, 'studio_settings', merged);
  return merged;
}

export function getBrandsPolicy(db: Database.Database, configDir?: string): BrandPolicy[] {
  const saved = getSettingValue<unknown>(db, 'brands_policy');
  if (Array.isArray(saved)) {
    const parsed = z.array(BrandPolicySchema).safeParse(saved);
    if (parsed.success && parsed.data.length > 0) {
      return parsed.data;
    }
  }

  // Fallback to config/brands.json or config/brands.example.json
  if (configDir) {
    for (const filename of ['brands.json', 'brands.example.json']) {
      const p = join(configDir, filename);
      if (existsSync(p)) {
        try {
          const json = JSON.parse(readFileSync(p, 'utf-8')) as { brands?: unknown };
          const parsed = z.array(BrandPolicySchema).safeParse(json.brands);
          if (parsed.success && parsed.data.length > 0) {
            return parsed.data;
          }
        } catch {
          // fall through to default
        }
      }
    }
  }

  return DEFAULT_BRANDS;
}

export function saveBrandsPolicy(db: Database.Database, brands: BrandPolicy[]): BrandPolicy[] {
  const validated = z.array(BrandPolicySchema).parse(brands);
  setSettingValue(db, 'brands_policy', validated);
  return validated;
}

export function loadSocTiers(configDir?: string): Record<string, number> {
  const candidates: string[] = [];
  if (configDir) {
    candidates.push(join(configDir, 'soc-tiers.json'), join(configDir, 'soc-tiers.example.json'));
  }
  candidates.push(
    join(process.cwd(), 'config/soc-tiers.json'),
    join(process.cwd(), 'config/soc-tiers.example.json'),
    join(process.cwd(), '../../config/soc-tiers.json'),
    join(process.cwd(), '../../config/soc-tiers.example.json')
  );

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
        const tiers: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!k.startsWith('_') && typeof v === 'number') {
            tiers[k] = v;
          }
        }
        return tiers;
      } catch {
        // continue
      }
    }
  }
  return {};
}

export function lookupSocTier(socName: string | null | undefined, tiers: Record<string, number>): number | null {
  if (!socName) return null;
  const cleaned = socName
    .replace(/^(Qualcomm|MediaTek|Google|Apple|Samsung)\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\bSM\d+[A-Z0-9-]*\b/gi, '')
    .trim()
    .toLowerCase();

  // 1. Exact match (case-insensitive)
  for (const [k, v] of Object.entries(tiers)) {
    if (k.toLowerCase() === cleaned || k.toLowerCase() === socName.trim().toLowerCase()) {
      return v;
    }
  }

  // 2. Longest substring match (e.g., "Snapdragon 8 Gen 3 Mobile Platform" -> "Snapdragon 8 Gen 3")
  let bestKey = '';
  let bestTier: number | null = null;
  for (const [k, v] of Object.entries(tiers)) {
    const kl = k.toLowerCase();
    if (cleaned.includes(kl) && kl.length > bestKey.length) {
      bestKey = kl;
      bestTier = v;
    }
  }
  return bestTier;
}

export function writeAuditLog(
  db: Database.Database,
  actor: string,
  action: string,
  target: string,
  detail?: Record<string, unknown>
): void {
  db.prepare(
    `INSERT INTO audit_log (at, actor, action, target, detail_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    actor,
    action,
    target,
    detail ? JSON.stringify(detail) : null
  );
}

export function getFreeDiskGB(targetPath: string): number | null {
  try {
    const stats = statfsSync(targetPath);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return Math.round((freeBytes / (1024 * 1024 * 1024)) * 10) / 10;
  } catch {
    return null;
  }
}
