# Data model

## 1. SQLite tables (UTC ISO timestamps, TEXT ids = ULID)
```sql
CREATE TABLE phones(
  id TEXT PRIMARY KEY, brand TEXT NOT NULL, model TEXT NOT NULL, variant TEXT, -- e.g. "8/256"
  release_date TEXT, soc TEXT, soc_tier INTEGER, price_usd REAL, price_note TEXT,
  original_price REAL, original_currency TEXT, fx_rate REAL, fx_date TEXT, price_region TEXT,
  accent TEXT, created_at TEXT NOT NULL, UNIQUE(brand, model, variant));

CREATE TABLE spec_values(
  id TEXT PRIMARY KEY, phone_id TEXT NOT NULL REFERENCES phones(id),
  category_key TEXT NOT NULL, raw_value TEXT, num_value REAL, unit TEXT, display_primary TEXT, display_secondary TEXT,
  source_url TEXT, source_kind TEXT,         -- 'official' | 'grounded' | 'manual' | 'secondary'
  fetched_at TEXT, confidence REAL,          -- 0..1
  conflict INTEGER DEFAULT 0, UNIQUE(phone_id, category_key));

CREATE TABLE benchmark_snapshots(
  id TEXT PRIMARY KEY, source TEXT NOT NULL, version TEXT NOT NULL, period TEXT NOT NULL, -- "2026-10"
  source_url TEXT, taken_at TEXT, method TEXT, permission_note TEXT);
CREATE TABLE benchmark_scores(
  id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES benchmark_snapshots(id),
  phone_id TEXT NOT NULL REFERENCES phones(id), variant_used TEXT,
  main REAL NOT NULL, parts_json TEXT NOT NULL, UNIQUE(snapshot_id, phone_id));

CREATE TABLE images(
  id TEXT PRIMARY KEY, phone_id TEXT NOT NULL REFERENCES phones(id), kind TEXT, -- 'front'|'back'|'hero'
  file_path TEXT, sha256 TEXT, license TEXT, author TEXT, source_url TEXT, accessed_at TEXT,
  terms_url TEXT, allows_modification INTEGER, status TEXT); -- 'ok'|'blocked'|'missing'

CREATE TABLE comparisons(
  id TEXT PRIMARY KEY, title TEXT, phone_ids_json TEXT NOT NULL, formats_json TEXT NOT NULL, -- ["long","short"]
  status TEXT NOT NULL, topic_id TEXT, final_json TEXT, theme_version TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE topics(
  id TEXT PRIMARY KEY, phone_ids_json TEXT NOT NULL, score REAL, reasons_json TEXT, angle TEXT,
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed|approved|rejected|used
  created_at TEXT NOT NULL);

CREATE TABLE copy_assets(id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, kind TEXT, -- titles|description|tags|labels|hook
  payload_json TEXT NOT NULL, prompt_id TEXT, prompt_version TEXT, provider TEXT, model TEXT, created_at TEXT);

CREATE TABLE renders(id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, format TEXT, -- long|short|thumbnail
  stage TEXT, -- preview|final
  file_path TEXT, duration_s REAL, size_bytes INTEGER, status TEXT, created_at TEXT);

CREATE TABLE publications(id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL, format TEXT, handoff_mode TEXT,
  handoff_ref TEXT, youtube_id TEXT, scheduled_at TEXT, status TEXT, error TEXT, created_at TEXT);

CREATE TABLE jobs(id TEXT PRIMARY KEY, comparison_id TEXT, type TEXT NOT NULL, state TEXT NOT NULL, -- queued|running|done|failed|blocked
  attempt INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 2, payload_json TEXT, result_json TEXT,
  progress REAL DEFAULT 0, error TEXT, lease_until TEXT, run_after TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE job_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, at TEXT, level TEXT, message TEXT);

CREATE TABLE llm_usage(provider TEXT, day TEXT, count INTEGER, PRIMARY KEY(provider, day));
CREATE TABLE llm_cache(key TEXT PRIMARY KEY, task TEXT, response_json TEXT, created_at TEXT);
CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, action TEXT, target TEXT, detail_json TEXT);
```

## 2. Comparison status (see `PIPELINE_AND_JOBS.md`)
`CREATED → COLLECTED → [GATE_A] → DATA_APPROVED → COPY_READY → PREVIEW_RENDERED → [GATE_B] → VIDEO_APPROVED → FINAL_RENDERED → METADATA_READY → HANDED_OFF → PUBLISHED`, plus `FAILED` with `failed_stage`.

## 3. Render contract (Zod, extends `packages/video/src/types.ts`)
`final_json` is a `Comparison` exactly as in `types.ts` (phones[2..3], categories[], benchmarks[]) with these **additions** (all optional for the existing compositions, required by the new ones):
```ts
Comparison += {
  title?: string;                       // video title shown in Intro
  market: 'global'; currency: 'USD';
  overall?: {ranking: number[]; points: number[]};   // from verdict engine
  hook?: string;                        // Short hook text, <= 40 chars
  labels?: Record<string,string>;       // category_key -> label override
  credits: string[];                    // data/image/music credits for description
}
Phone += {soc?: string; releaseDate?: string; priceNote?: string; // 'Launch price, approx.'}
```
Rules enforced by `validateComparison` (extend it, do not weaken): 2–3 phones; every category `values.length === ranking.length === phones.length`; at least one rank 1; image requires `license`; benchmark `scores.length === phones.length`; ≤ 4 parts.
Add: `validateNumbers(comparison, copy)` → every number token in copy and on-screen strings must appear in the data (after formatting). Returns a list of offenders.

## 4. Display conventions
Prices `$349`; approximated conversion `≈$349`; scores with thousands separators; units `Hz`, `nits`, `mAh`, `W`, `MP`, `GB` (single glossary in `packages/core/glossary.ts`).

## 5. Migrations
Numbered `001_init.sql`, `002_...`; applied at worker/web start; never edit an applied migration.

## 6. PhoneShape (drives the parametric phone)
```ts
PhoneShape = {
  bodyMM: {h:number,w:number,d:number} | null,
  screenInch: number | null, aspect: number | null,          // e.g. 20/9 -> 2.22
  frontCamera: 'punch_center'|'punch_left'|'punch_right'|'waterdrop'|'notch'|'pill'|'under_display'|'unknown',
  edge: 'flat'|'curved'|'dual_curve'|'unknown',
  frame: 'flat'|'round'|'unknown',
  rearLenses: 1|2|3|4|null,
  evidence: Record<string,string|null>                        // snippet per field
}
```
Add column `phones.shape_json`. Unknown values use defaults at render time: `punch_center`, `flat`, `flat`, aspect from resolution or 2.17, bezel computed from `screenInch`+`aspect`+`bodyMM` else typical 2.5 mm side / 4 mm chin. Bezel formula: `screenW = diagonal / sqrt(1 + aspect^2)`; `side bezel = (bodyW - screenW) / 2` (clamped 1–6 mm). Rear layout is **not** modeled in MVP (front view only).
