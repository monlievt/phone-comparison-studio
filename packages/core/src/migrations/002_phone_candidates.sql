-- Migration 002: phone candidates table for auto discovery
-- Stores phones discovered from RSS, Nanoreview, or Gemini search

CREATE TABLE IF NOT EXISTS phone_candidates (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT,
  source TEXT NOT NULL,                -- 'gsmarena_rss' | 'nanoreview' | 'gemini_search' | 'manual'
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'announced', -- 'announced' | 'released' | 'ready' | 'dismissed'
  announced_date TEXT,
  release_date TEXT,
  estimated_price_usd REAL,
  soc_name TEXT,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand, model, variant)
);

CREATE INDEX IF NOT EXISTS idx_phone_candidates_status ON phone_candidates(status);
CREATE INDEX IF NOT EXISTS idx_phone_candidates_brand_model ON phone_candidates(brand, model);
