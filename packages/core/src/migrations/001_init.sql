-- Migration 001: initial schema
-- Applied at: worker/web start
-- Never edit an applied migration; create a new one instead.

CREATE TABLE IF NOT EXISTS phones (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT,                         -- e.g. "8/256"
  release_date TEXT,
  soc TEXT,
  soc_tier INTEGER,
  price_usd REAL,
  price_note TEXT,
  original_price REAL,
  original_currency TEXT,
  fx_rate REAL,
  fx_date TEXT,
  price_region TEXT,
  accent TEXT,                          -- hex color, drives video theme
  shape_json TEXT,                      -- PhoneShape JSON for parametric render
  created_at TEXT NOT NULL,
  UNIQUE(brand, model, variant)
);

CREATE TABLE IF NOT EXISTS spec_values (
  id TEXT PRIMARY KEY,
  phone_id TEXT NOT NULL REFERENCES phones(id),
  category_key TEXT NOT NULL,
  raw_value TEXT,
  num_value REAL,
  unit TEXT,
  display_primary TEXT,
  display_secondary TEXT,
  source_url TEXT,
  source_kind TEXT,                     -- 'official' | 'grounded' | 'manual' | 'secondary'
  fetched_at TEXT,
  confidence REAL,                      -- 0..1
  conflict INTEGER DEFAULT 0,
  UNIQUE(phone_id, category_key)
);

CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  period TEXT NOT NULL,                 -- "2026-10"
  source_url TEXT,
  taken_at TEXT,
  method TEXT,                          -- 'manual' | 'fetched'
  permission_note TEXT
);

CREATE TABLE IF NOT EXISTS benchmark_scores (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES benchmark_snapshots(id),
  phone_id TEXT NOT NULL REFERENCES phones(id),
  variant_used TEXT,
  main REAL NOT NULL,
  parts_json TEXT NOT NULL,             -- JSON: Record<string, number>
  UNIQUE(snapshot_id, phone_id)
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  phone_id TEXT NOT NULL REFERENCES phones(id),
  kind TEXT,                            -- 'front' | 'back' | 'hero'
  file_path TEXT,
  sha256 TEXT,
  license TEXT,
  author TEXT,
  source_url TEXT,
  accessed_at TEXT,
  terms_url TEXT,
  allows_modification INTEGER,
  status TEXT                           -- 'ok' | 'blocked' | 'missing'
);

CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  title TEXT,
  phone_ids_json TEXT NOT NULL,         -- JSON: string[]
  formats_json TEXT NOT NULL,           -- JSON: ("long" | "short")[]
  status TEXT NOT NULL,
  topic_id TEXT,
  final_json TEXT,                      -- Comparison render contract JSON
  theme_version TEXT,
  failed_stage TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  phone_ids_json TEXT NOT NULL,
  score REAL,
  reasons_json TEXT,
  angle TEXT,
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | rejected | used
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS copy_assets (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  kind TEXT,                            -- 'titles' | 'description' | 'tags' | 'labels' | 'hook'
  payload_json TEXT NOT NULL,
  prompt_id TEXT,
  prompt_version TEXT,
  provider TEXT,
  model TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  format TEXT,                          -- 'long' | 'short' | 'thumbnail'
  stage TEXT,                           -- 'preview' | 'final'
  file_path TEXT,
  duration_s REAL,
  size_bytes INTEGER,
  status TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  format TEXT,
  handoff_mode TEXT,                    -- 'http' | 'folder' | 'manual'
  handoff_ref TEXT,
  youtube_id TEXT,
  scheduled_at TEXT,
  status TEXT,
  error TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  comparison_id TEXT,
  type TEXT NOT NULL,
  state TEXT NOT NULL,                  -- queued | running | done | failed | blocked
  attempt INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 2,
  payload_json TEXT,
  result_json TEXT,
  progress REAL DEFAULT 0,
  error TEXT,
  lease_until TEXT,
  run_after TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  at TEXT,
  level TEXT,
  message TEXT
);

CREATE TABLE IF NOT EXISTS llm_usage (
  provider TEXT,
  day TEXT,                             -- ISO date YYYY-MM-DD
  count INTEGER,
  PRIMARY KEY(provider, day)
);

CREATE TABLE IF NOT EXISTS llm_cache (
  key TEXT PRIMARY KEY,
  task TEXT,
  response_json TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT,
  actor TEXT,
  action TEXT,
  target TEXT,
  detail_json TEXT
);

-- Indexes for hot query paths
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state, run_after);
CREATE INDEX IF NOT EXISTS idx_jobs_comparison ON jobs(comparison_id);
CREATE INDEX IF NOT EXISTS idx_spec_values_phone ON spec_values(phone_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_day ON llm_usage(day);

-- Schema version tracking
INSERT OR IGNORE INTO settings(key, value_json) VALUES ('schema_version', '1');
