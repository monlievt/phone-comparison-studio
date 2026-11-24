// packages/collectors/src/images/image-resolver.ts
// Resolves phone images with strict license verification.
// Specification: docs/MODULES.md §4 and docs/COMPLIANCE.md

import { Database } from '@phone-studio/core';
import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface BrandConfig {
  brand: string;
  termsUrl: string;
  allowed: boolean | null; // true = allowed, false = blocked, null = unknown (treated as blocked)
  allowsModification?: boolean;
  logoAllowed?: boolean;
}

export interface ImageResolveResult {
  imageId: string;
  status: 'ok' | 'blocked' | 'missing';
  filePath?: string;
  license: string;
  sourceUrl?: string;
  useParametricPhone: boolean;
}

export class ImageResolver {
  private brandsMap: Map<string, BrandConfig> = new Map();

  constructor(
    private db: Database.Database,
    private assetsDir: string,
    brandsList?: BrandConfig[]
  ) {
    if (!existsSync(this.assetsDir)) {
      mkdirSync(this.assetsDir, { recursive: true });
    }

    if (brandsList) {
      for (const b of brandsList) {
        this.brandsMap.set(b.brand.toLowerCase(), b);
      }
    }
  }

  isBrandAllowed(brand: string): boolean {
    const cfg = this.brandsMap.get(brand.toLowerCase());
    return cfg?.allowed === true;
  }

  async resolveImage(
    phoneId: string,
    brand: string,
    model: string,
    candidateUrl?: string,
    licenseType?: string
  ): Promise<ImageResolveResult> {
    const imageId = ulid();
    const now = new Date().toISOString();
    const brandLower = brand.toLowerCase();
    const brandCfg = this.brandsMap.get(brandLower);

    // Rule: If brand terms are not explicitly true, image is BLOCKED -> Fallback to Parametric Phone
    const brandAllowed = brandCfg?.allowed === true;
    const isWikimedia = candidateUrl ? /wikimedia\.org/i.test(candidateUrl) : false;

    if (!candidateUrl) {
      // Missing image
      this.recordImage(imageId, phoneId, 'missing', null, null, 'Parametric Phone Mockup', null, now);
      return {
        imageId,
        status: 'missing',
        license: 'Parametric Phone Mockup (No Image)',
        useParametricPhone: true,
      };
    }

    if (!brandAllowed && !isWikimedia) {
      // Blocked due to unverified license terms
      this.recordImage(imageId, phoneId, 'blocked', candidateUrl, null, 'Blocked (Unverified Brand Terms)', null, now);
      return {
        imageId,
        status: 'blocked',
        sourceUrl: candidateUrl,
        license: 'Blocked (Unverified Brand Terms)',
        useParametricPhone: true,
      };
    }

    // Attempt download and hash deduplication
    try {
      const res = await fetch(candidateUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const ext = candidateUrl.split('.').pop()?.split('?')[0] || 'png';
      const filename = `${sha256}.${ext}`;
      const filePath = join(this.assetsDir, filename);

      if (!existsSync(filePath)) {
        writeFileSync(filePath, buffer);
      }

      const finalLicense = isWikimedia ? (licenseType ?? 'CC BY-SA') : 'Official Press Kit (Terms Verified)';
      this.recordImage(imageId, phoneId, 'ok', candidateUrl, filePath, finalLicense, sha256, now);

      return {
        imageId,
        status: 'ok',
        filePath,
        sourceUrl: candidateUrl,
        license: finalLicense,
        useParametricPhone: false,
      };
    } catch (err) {
      console.warn(`[image-resolver] Download failed for ${candidateUrl}:`, err);
      this.recordImage(imageId, phoneId, 'missing', candidateUrl, null, 'Download Failed', null, now);
      return {
        imageId,
        status: 'missing',
        sourceUrl: candidateUrl,
        license: 'Download Failed',
        useParametricPhone: true,
      };
    }
  }

  private recordImage(
    id: string,
    phoneId: string,
    status: 'ok' | 'blocked' | 'missing',
    sourceUrl: string | null,
    filePath: string | null,
    license: string,
    sha256: string | null,
    now: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO images (id, phone_id, kind, file_path, sha256, license, source_url, accessed_at, status)
         VALUES (?, ?, 'front', ?, ?, ?, ?, ?, ?)`
      )
      .run(id, phoneId, filePath, sha256, license, sourceUrl, now, status);
  }
}
