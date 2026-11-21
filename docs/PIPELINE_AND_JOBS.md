# Pipeline and jobs

## Job types and order
| Type | Input | Output | Runs on |
|---|---|---|---|
| `find_topics` | filters (price band, SoC tier gap, date range) | `topics` rows | general |
| `collect_specs` | comparison | `spec_values`, `phones` | general |
| `collect_benchmarks` | comparison | `benchmark_scores` | general |
| `resolve_images` | comparison | `images` | general |
| `build_data` | approved raw data | `final_json` (verdict + validate) | general |
| `generate_copy` | final_json | `copy_assets` | general |
| `render_preview` | final_json + format | MP4 preview | render lock |
| `render_final` | approved comparison | MP4 + thumbnail | render lock |
| `build_metadata` | copy + data | titles, description, chapters, tags | general |
| `handoff` | final files + metadata | publication row | general |
| `cleanup` | — | disk freed | general |

Chain: topic → (Gate 0) → collect_specs ‖ collect_benchmarks ‖ resolve_images → **Gate A** → build_data → generate_copy → render_preview(long, short) → **Gate B** → render_final(long, short, thumbnail) → build_metadata → handoff.

## Worker rules
- Poll every 2 s. Claim: `UPDATE jobs SET state='running', lease_until=now+60s WHERE id=? AND state='queued'`; heartbeat every 20 s; expired lease → requeue.
- Concurrency: render jobs 1 (global lock); general jobs 2.
- Retry: `attempt < max_attempts` → exponential backoff (30 s, 120 s) via `run_after`; then `failed`.
- Idempotent: each stage overwrites its own outputs by `(comparison_id, stage)`; re-run does not duplicate rows. Retry from stage X invalidates only stages after X.
- Editing data after Gate A (or text after Gate B) invalidates `build_data`+ (or `render_*`+) and re-queues only those. Partial re-render of one segment is **not** required for MVP: re-render the format.
- Blocking (not failing) conditions → `state='blocked'` with reason: LLM quota exhausted, unlicensed image at Gate A, disk low, uploader unreachable.
- Every state change writes `job_logs` and, for approvals/edits, `audit_log`.

## Gates
| Gate | Blocks until | Owner sees |
|---|---|---|
| 0 | topic approved | pairs, score, reasons |
| A | data approved | spec table with sources, yellow flags, images + license, benchmarks |
| B | video approved | players, checks list, text edits |
Each gate has `policy: 'human' | 'auto'`. In `autopilot` mode all three are `auto` (Gate 0 by score threshold, Gate A by the Data Judge, Gate B by the Video Judge — see `AUTOPILOT.md`). In `manual` mode Gates A and B are human. New terminal states: `SKIPPED_LOW_DATA`, `FAILED_QA`, `CANCELLED` (hold window).

## Automatic checks before Gate B
1. `validateNumbers` ok. 2. No low-confidence value unresolved. 3. Sampled frames: no text overflow (render stills at segment midpoints; check bounding boxes via test harness in `VIDEO_SPEC.md` §6). 4. Audio peak < −1 dBFS and loudness within −16…−12 LUFS. 5. Duration within configured limits. 6. All images licensed or generic.
