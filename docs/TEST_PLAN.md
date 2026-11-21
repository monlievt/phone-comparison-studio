# Test plan

Runner: Vitest. `npm test` must be green before any task is done.

## Unit (packages/core, collectors, ai)
- Verdict: table tests in `VERDICT_RULES.md` §7.
- Parsers: units, ranges, weird formats (`8GB+8GB virtual`, `IPX8`, `2,400 nits peak`), failing → null.
- `validateNumbers`: positive and negative cases (extra number in copy must fail).
- `validateComparison`: existing rules + new ones; unlicensed image rejected.
- LLM router: provider fallback on 429/timeout, attempt caps, daily counter, cache hit skips call, schema-failure retry. Use fake providers.
- Spec verification: value not present in page text lowers confidence.
- Pair Finder: filters, scoring, 90-day dedupe, trio gap.
- Image Resolver: order, `allowed:null` blocks, generic fallback, license fields required.
- Publisher: folder-drop writes correct file set; idempotent re-submit.

## Integration
- Job queue: claim, lease expiry requeue, retry/backoff, blocked states, idempotent re-run.
- Gate API: 409 when conditions not met; edits invalidate only downstream stages.
- Render smoke: 2-phone and 3-phone `LongVideo`/`ShortVideo` using demo fixture at preview scale; file exists, duration equals `sequenceFrames`.

## End-to-end (manual script `npm run e2e`)
Using **offline fixtures** (saved HTML spec pages + fake LLM responses in `fixtures/`): create comparison → Gate A → Gate B → final render → folder-drop. No network, no LLM quota used. A second run with real providers is done manually once.

## Fixtures (`fixtures/`)
`spec-pages/*.html` (saved official-page text for 3 phones, owner-chosen), `llm/*.json` (recorded responses), `benchmarks/antutu-sample.csv`, `images/` (generic license-clean test images). `TODO-KONFIRMASI`: owner picks 3–5 real test pairs/trios; until then use demo data from `packages/video/src/data/demo.ts` (fictional).

## Quality gates (automated, before Gate B)
See `PIPELINE_AND_JOBS.md` and `VIDEO_SPEC.md` §6.

## Manual acceptance checklist (owner)
Numbers match source pages for 10 random cells · no ad posters on phone screens · licenses visible · winner ticks correct · audio comfortable · Short readable on a phone · upload arrives private in ytagent.
