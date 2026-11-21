# Implementation plan

Rules: one task per session; check dependencies; list acceptance checks before coding; stop at `TODO-KONFIRMASI` (see `OPEN_ITEMS.md`). "Check" = what must be demonstrated.

## Phase 0 — Foundation
| ID | Task | Depends | Check |
|---|---|---|---|
| T-001 | Create npm-workspaces monorepo per `AGENTS.md`; move zip contents into `packages/video` unchanged | — | `npm run video:studio` opens; `npm run render:short2` in package still works |
| T-002 | `packages/core`: Zod schemas for DATA_MODEL §3, re-export video types, SQL migrations 001 | T-001 | migrate on empty DB; schema tests |
| T-003 | Config loader (`.env`, `config/*.json`, settings table) with validation | T-002 | missing key → clear error |
| T-004 | Job queue + worker loop (lease, heartbeat, retry, blocked) | T-002 | queue tests in TEST_PLAN |
| T-005 | Web shell: login, `/api/health`, Home page skeleton, SSE channel | T-003 | login works; health shows disk and db |

## Phase 1 — Core logic (pure code, test first)
| T-010 | `parse.ts` unit/number parsers | T-002 | parser table tests |
| T-011 | Verdict engine per `VERDICT_RULES.md` | T-010, items 4–5 | all table tests; works with demo data and matches existing `ranking` semantics |
| T-012 | `validateNumbers` + extend `validateComparison` | T-011 | positive/negative tests |
| T-013 | Glossary and display formatters | T-010 | snapshot tests |

## Phase 2 — AI layer
| T-020 | LLM router (providers, fallback, caps, counter, cache) | T-003, items 1–2 | fake-provider tests; real call smoke test with a tiny prompt |
| T-021 | Prompt registry with versions + Zod output schemas (`PROMPTS.md`) | T-020 | schema failure retry test |

## Phase 3 — Collectors
| T-030 | Polite fetcher + readable-text extractor + cache | T-003 | robots and rate-limit tests with local server |
| T-031 | Spec Collector (extract + verify + confidence + cache) | T-021, T-030 | recorded-fixture test: fake number → lowered confidence |
| T-032 | Benchmark CSV import + matching | T-002, item 7 | import sample CSV; ambiguous match flagged |
| T-033 | Image Resolver + brands config + generic fallback | T-030, item 6 | `allowed:null` → blocked; license fields stored |
| T-033b | Shape fields in spec extraction + defaults + `phones.shape_json` | T-031 | missing fields fall back; evidence stored |
| T-034 | Pair Finder + topics API | T-011, T-021 | filters and scoring tests; list of reasons produced |

## Phase 4 — Video
| T-040 | Switch `PhoneMock` to `staticFile` for local paths; render service in worker (bundle once, progress, lock) | T-001, T-004 | preview of demo `LongVideo3` via worker; progress in DB |
| T-040b | `ParametricPhone` component + bezel math + golden stills; `PhoneMock` falls back to it | T-040, T-033b | 6 golden stills; relative size preserved |
| T-041 | Measure render time and memory on target machine; set defaults | T-040, item 11 | numbers recorded in settings and `docs/` |
| T-042 | `Intro` + count-up numbers | T-040 | stills reviewed by owner |
| T-043 | `ScoreRecap` + `Outro` | T-042, T-011 | recap matches `overall` |
| T-044 | `ShortHook` + `ShortWinner` | T-042 | Short ≤ 50 s |
| T-045 | Transitions and corrected `calculateMetadata` totals | T-043, T-044 | total frames = sum − overlaps |
| T-045b | Persistent `Stage` + `CameraRig` + motion presets + transition plan per `MOTION_STYLE.md` (M1–M6, M11); keep old Category* compositions via `embedded` prop | T-045 | Long/Short demo render shows phones persisting; old preview compositions unchanged |
| T-046 | `Thumbnail` still + export size rule | T-042 | PNG ≤ 2 MB |
| T-047 | Automated checks (overflow, loudness, duration, plus `MOTION_STYLE.md` §5 checks) | T-045b | deliberately bad fixtures (slide-like, static, 3 text levels) fail |
| T-048 | Replace placeholder audio with licensed files + `LICENSES.json` guard | item 9 | render fails without license entry |

## Phase 5 — Pipeline and dashboard
| T-050 | Pipeline orchestration (jobs chain, gates, invalidation) | T-004, T-031–T-034, T-040 | e2e on offline fixtures reaches `FINAL_RENDERED` |
| T-051 | Copy generator + template fallback + metadata builder (chapters from segment times) | T-021, T-045 | validator blocks bad number |
| T-052 | UI: Topics (Gate 0), New video | T-034, T-005 | approve creates comparison |
| T-053 | UI: Gate A | T-050 | red cells block approve |
| T-054 | UI: Gate B | T-047, T-051 | checks list visible; copy edit re-validates |
| T-055 | UI: Library, Jobs, Settings, LLM quota meter | T-050 | retry from failed stage works |

## Phase 6 — Publish and hardening
| T-060 | Read ytagent locally; write `docs/YTAGENT_INTEGRATION.md`; owner confirms | item 3 | doc lists accepted format |
| T-061 | Publisher adapter (+ publish page, cross-link Long/Short) | T-060, T-054 | file lands in ytagent; status tracked |
| T-064 | Autopilot controller: scheduler, Data Judge, Video Judge, copy fallback, hold window, brakes, `PAUSE` file, kill switch | T-050, T-047, T-061 | simulated bad-data fixture → `SKIPPED_LOW_DATA`; bad render fixture → `FAILED_QA`; 2 failures → paused |
| T-065 | Notifications (dashboard + optional webhook) and weekly digest | T-064 | digest lists made/skipped/failed with reasons |
| T-066 | Soak test: 5 consecutive offline autopilot runs with mixed good/bad fixtures; no crash, no bad publish | T-064 | report in `docs/` |
| T-062 | Cleanup job + disk guard | T-040 | old renders removed; low disk blocks render |
| T-063 | Full dry run with 3 real pairs (owner-chosen), fix list | all | owner acceptance checklist in `TEST_PLAN.md` passes |
