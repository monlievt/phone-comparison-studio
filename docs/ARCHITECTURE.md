# Architecture ($0, local)

## 1. Processes (all on one machine)
```
Browser ──> apps/web (Next.js, port 3000)
              │ writes jobs / reads status          ┌─> Gemini API free tier (AI Studio key)
              ▼                                      ├─> OpenRouter ":free" models
         SQLite (data/app.db) <── apps/worker ───────┤─> optional local model (Ollama) as last fallback
              ▲                      │               └─> public web pages (official brand sites)
              │                      ├─> @remotion/renderer (Chromium, concurrency 1)
         data/ files                 └─> packages/publisher ──> ytagent (existing app)
```
- No Docker, Redis, Postgres, MinIO. Start with `npm run dev:all` (web + worker).
- Docker is optional and out of scope for MVP.

## 2. Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | one language with Remotion |
| Web | Next.js App Router | dashboard + route handlers |
| DB | SQLite via `better-sqlite3`, SQL migrations in `packages/core/migrations` | zero setup |
| Queue | `jobs` table + polling worker (lease + heartbeat) | no Redis needed |
| Validation | Zod | shared schemas |
| Render | `@remotion/bundler` + `@remotion/renderer` | already built video package |
| Tests | Vitest | |
| Files | `data/` on local disk | |

## 3. Existing code adoption
`comparison-video.zip` becomes `packages/video` unchanged (Remotion 4.0.542, React 19). Keep its scripts working. Its `types.ts` is the **render contract**; `packages/core` re-exports and extends it (see `DATA_MODEL.md` §3). Demo data stays as test fixture only.

## 4. Render integration
1. Worker copies licensed images to `packages/video/public/runtime/<comparisonId>/` and rewrites `PhoneImage.src` to `runtime/<comparisonId>/<file>` (existing `PhoneMock` uses `<Img src=...>`; **T-040 must switch to `staticFile()` for non-http paths**).
2. Bundle once per worker start (`bundle()`), reuse the bundle.
3. `selectComposition` + `renderMedia` with `inputProps = {comparison}`; `concurrency` from config; write progress to `jobs.progress`.
4. Preview: scale 0.4, `crf` high. Final: 1080p, 30 fps.

## 5. LLM budget strategy (free tiers change; verify in provider dashboards)
Known at time of writing (verify before relying):
- OpenRouter `:free` models: 20 requests/min; 50 requests/day (1,000/day only after lifetime purchase of $10+, not used here). Free models rotate and may disappear.
- Google AI Studio API key (free tier): per-project RPM/RPD limits shown in AI Studio; free-tier data may be used by Google to improve products. Search grounding has its own, smaller free allowance. **A Gemini app subscription is not an API key**; create a key in AI Studio.
- `TODO-KONFIRMASI`: what "Gemini 4 Argon" in the owner's subscription refers to and whether it exposes an API.

Rules:
- `packages/ai` exposes `callJson({task, schema, prompt})`. Provider order and model names come from `config/ai.json`, e.g. `["gemini-free","openrouter-free","local"]`. On 429/5xx/timeout: next provider. Max 2 attempts per provider. Cap per video: 8 calls (config).
- Persistent counter table `llm_usage(provider, day, count)`; stop before the limit and surface "LLM quota reached" in the dashboard instead of failing silently.
- Cache: `spec_cache` per phone (key = brand+model+variant), TTL 30 days; benchmark snapshots monthly. Never call an LLM for data already cached.
- Prefer **non-LLM** work whenever possible: HTML→text extraction, regex/number parsing, deterministic verdict, template-based copy fallback (see `PROMPTS.md` §6) when quota is out.
- Only public data in prompts.

## 6. Fetching web data (free)
- Own fetcher (`fetch` + readable-text extraction), polite: 1 req/s/host, cache pages, honor robots.txt, identify with a user-agent. No scraping of sites that forbid it (`COMPLIANCE.md`).
- Source providers (interface `SpecSource`): (a) official brand spec page URL (owner-provided or discovered), (b) Gemini grounded search when quota allows, (c) manual entry in Gate A. Provider results are merged with confidence rules (`MODULES.md` §2).

## 7. Disk policy
- `data/renders/<id>/`: keep final MP4s + thumbnail until published, then 14 days; previews deleted at final approval; Remotion temp dirs deleted after each render.
- `data/assets/`: images deduped by hash.
- Settings: `maxDiskGB` (default 20). Before each render check free space ≥ 5 GB, else fail with a clear job error and run cleanup.
- Log rotation: keep 14 days.

## 8. Security
Dashboard bound to `127.0.0.1` by default; password from `.env`; ytagent credentials never copied into this repo; `.env` and `data/` git-ignored; audit log for approvals and edits.

## 9. Observability
Structured JSON logs to `data/logs/`; per-job log visible in dashboard; `/api/health` returns db, disk, render lock, LLM quota.
