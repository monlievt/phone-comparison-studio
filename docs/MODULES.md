# Module specifications

Each module = one folder with `index.ts`, Zod-typed input/output, unit tests, and no side effects outside its declared outputs.

## 1. Pair Finder (`packages/collectors/pairs`)
**Goal**: propose pairs/trios worth comparing; owner approves (Gate 0).
**Candidate pool** (in order): (a) `phones` table (already collected), (b) owner-supplied list in Settings, (c) LLM/grounded search "phones launched in the last 12 months with price between X and Y USD" (1 call, cached 7 days), results must be verified in Gate A anyway.
**Rules** (hard filters): same variant class; both have `priceUSD`; for pairs `|ΔP| ≤ max($40, 15%)`; for trios `(max−min) ≤ max($60, 20%)`; OR (SoC mode) same `soc_tier` ±1 with price gap ≤ 35%. Reject pairs already used in the last 90 days.
**Score (0–100)**: `0.30 priceCloseness + 0.30 socSimilarity + 0.15 recency(≤12 mo) + 0.15 dataAvailability (specs+benchmarks coverage) + 0.10 rivalryBonus (different brands)`. Weights in settings.
**Output**: `topics` rows with `reasons_json` (`["Price gap $20","Same SoC tier","Both launched 2026"]`) and `angle` (short English phrase from template: "Same price, different strengths"). No LLM needed for scoring.
**Not available at $0**: search-demand signal (no free official Google Trends API). `TODO-KONFIRMASI`: optional manual "trend boost" field per phone.

## 2. Spec Collector (`packages/collectors/specs`)
Input: brand, model, variant. Output: `phones` + `spec_values` for all default categories.
1. Find official spec URL: owner-provided → cached → grounded search (if quota) → ask owner at Gate A.
2. Fetch page, extract readable text (strip nav/scripts), keep ≤ 12k chars around spec tables.
3. One LLM call per phone (`spec_extract`, `PROMPTS.md`): returns for each category key: `value`, `evidence` (verbatim snippet ≤ 20 words) or `null`.
4. **Verification (code)**: the numeric tokens of `value` must appear in the page text; else confidence ×0.4 and flag.
5. Confidence: official page + verified = 0.9; two independent sources agree = 0.95; single secondary = 0.5; manual = 1.0; conflict (values differ) = `conflict=1`, confidence 0.3.
6. Price: launch MSRP in USD; if only local currency, store `original_*`, `fx_rate`, `fx_date`, mark `price_note='Launch price, approx.'`. FX rate must come from a cited source or manual entry; never invented.
7. Cache per phone; re-collect only on owner request or TTL.

## 3. Benchmark snapshots (`packages/collectors/benchmarks`)
- Primary path: **manual import** of a CSV into `data/snapshots/<source>/<YYYY-MM>.csv` via dashboard (columns: `device,variant,main,part1..part4`, header row names the parts). Always allowed.
- Optional fetch path: only when `permission_note` is set for that source (written permission or documented terms allow). Default off. `TODO-KONFIRMASI` per source (AnTuTu, Geekbench, 3DMark, DXOMARK).
- Match phone → row by normalized name + variant; ambiguous → owner picks at Gate A. Never mix versions in one segment. Missing score → segment skipped.
- Credits go to `Comparison.credits`.

## 4. Image Resolver (`packages/collectors/images`)
Order (stop at first ok): (1) official brand site/press kit, terms checked per brand (`config/brands.json`: `{brand, termsUrl, allowed:true|false|null, allowsModification}`), (2) Wikimedia Commons CC0/PD/CC BY (store attribution), (3) generic mock (existing), (4) never GSMArena or similar without written permission.
- `allowed:null` (unknown) → treated as **blocked**; owner sets it in Settings after reading the terms.
- Save file to `data/assets/<sha256>.<ext>`; row in `images`; remove nothing from the image (no watermark cropping) unless `allowsModification`.
- Output status `ok|blocked|missing`; blocked/missing → **parametric phone** (`VIDEO_SPEC.md` §8). Never blocks the pipeline. Optional `data/assets/inbox/<brand>-<model>/` is scanned if present (manual press-kit drop); never required.
- Logos: brand name is text only; official logo SVG only when `brands.logoAllowed:true`, taken from the press kit, never redrawn.
- Shape extraction (`PhoneShape`, `DATA_MODEL.md` §6) runs inside the Spec Collector call (extra fields, no extra LLM call).

## 5. Verdict engine → `VERDICT_RULES.md`.

## 6. Copy generator → `PROMPTS.md` (one LLM call per video, template fallback).

## 7. Audio plan → `VIDEO_SPEC.md` §5 (code only).

## 8. Thumbnail → `VIDEO_SPEC.md` §4.

## 9. Publisher adapter (`packages/publisher`)
Interface:
```ts
interface Publisher { submit(p: PublishRequest): Promise<{ref: string; status: 'queued'|'uploaded'|'scheduled'}>; status(ref: string): Promise<...>; }
type PublishRequest = {videoPath: string; format:'long'|'short'; thumbnailPath?: string; metadata: YtMetadata; visibility:'private'|'unlisted'|'public'; publishAt?: string; linkedTo?: string};
type YtMetadata = {title: string; description: string; tags: string[]; categoryId: '28'; language:'en'; madeForKids:false; containsSyntheticMedia: boolean; chapters?: {t:number,label:string}[]};
```
Implementations: `FolderDropPublisher` (writes `<name>.mp4`, `<name>.jpg/png`, `<name>.json` into the folder watched by ytagent's filewatcher), `HttpPublisher` (if ytagent exposes an API), `ManualPublisher` (export folder only).
**First task (T-060)**: read the local ytagent repo (`README`, `docs/`, `.env.example`, `services/filewatcher`, `app/`), then write `docs/YTAGENT_INTEGRATION.md` stating exactly what it accepts (folder format? API? metadata keys? scheduling?). Until then the integration contract above is a proposal. `TODO-KONFIRMASI`.
Defaults: first uploads **private**; Short and Long cross-linked in descriptions; synthetic-media disclosure flag follows YouTube's current policy (check `COMPLIANCE.md`).
