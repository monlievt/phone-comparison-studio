// packages/collectors/src/tracker/tracker-service.ts
// Service to orchestrate discovery and save into SQLite phone_candidates table

import Database from 'better-sqlite3';
import { ulid } from 'ulid';
import { fetchGsmArenaCandidates, DiscoveredPhone } from './gsmarena.js';
import { fetchNanoreviewCandidates } from './nanoreview.js';

export interface TrackerSummary {
  gsmarenaFound: number;
  nanoreviewFound: number;
  inserted: number;
  updated: number;
}

export class CandidateTrackerService {
  constructor(private db: Database.Database) {}

  async runDiscovery(): Promise<TrackerSummary> {
    const summary: TrackerSummary = {
      gsmarenaFound: 0,
      nanoreviewFound: 0,
      inserted: 0,
      updated: 0,
    };

    // 1. Fetch from GSMArena RSS
    const gsmCandidates = await fetchGsmArenaCandidates();
    summary.gsmarenaFound = gsmCandidates.length;
    for (const phone of gsmCandidates) {
      this.upsertCandidate(phone, 'gsmarena_rss', summary);
    }

    // 2. Fetch from Nanoreview
    const nanoCandidates = await fetchNanoreviewCandidates();
    summary.nanoreviewFound = nanoCandidates.length;
    for (const phone of nanoCandidates) {
      this.upsertCandidate(phone, 'nanoreview', summary);
    }

    return summary;
  }

  private upsertCandidate(
    phone: DiscoveredPhone,
    source: 'gsmarena_rss' | 'nanoreview' | 'gemini_search',
    summary: TrackerSummary
  ): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id, status FROM phone_candidates WHERE brand = ? AND model = ?')
      .get(phone.brand, phone.model) as { id: string; status: string } | undefined;

    if (existing) {
      // If was previously announced and now released, update it
      if (existing.status === 'announced' && phone.status === 'released') {
        this.db
          .prepare('UPDATE phone_candidates SET status = ?, updated_at = ? WHERE id = ?')
          .run('released', now, existing.id);
        summary.updated++;
      }
    } else {
      const id = ulid();
      this.db
        .prepare(
          `INSERT INTO phone_candidates (
            id, brand, model, source, source_url, status, announced_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          phone.brand,
          phone.model,
          source,
          phone.sourceUrl,
          phone.status,
          phone.announcedDate ?? null,
          now,
          now
        );
      summary.inserted++;
    }
  }

  /**
   * Retrieves all candidate phones that are ready or released and not dismissed.
   */
  getAvailableCandidates(): Array<{ brand: string; model: string; status: string; source_url: string }> {
    return this.db
      .prepare(
        `SELECT brand, model, status, source_url
         FROM phone_candidates
         WHERE status IN ('announced', 'released', 'ready')
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all() as Array<{ brand: string; model: string; status: string; source_url: string }>;
  }
}
