# AGENTS.md — Phone Comparison Video Studio

Read this file first in every session. Then read `docs/README.md` (index) and only the docs the current task needs.

## What this project is
A local web app that turns 2–3 phone names into a Long (16:9) and a Short (9:16) comparison video and hands them to the existing YouTube uploader (`monliev/ytagent`). Audience: global, English. Budget: $0. Runs on one local machine.

## Hard rules (never break)
1. **Budget $0.** No paid API, no paid hosting. Every external call goes through `packages/ai` (LLM router) or a documented free source. Never hard-code a model name; read it from config.
2. **AI never decides winners.** Ranking is computed by `packages/core/verdict` (pure code). AI only extracts specs and writes short English text.
3. **Every number on screen must exist in the approved data JSON.** `validateNumbers()` must pass before render.
4. **No image without license metadata.** `license`, `sourceUrl`, `accessedAt` required. No license → blocked at Gate A, generic phone mock is the fallback.
5. **Do not invent data.** If a spec, price, score, URL or license is unknown, store `null` and flag it. Never fill from memory. Items marked `TODO-KONFIRMASI` in docs are open decisions: ask the owner, do not guess.
6. **Remotion compositions are pure** (props in, pixels out). No fetch, no DB, no randomness inside `packages/video/src`.
7. **Secrets** only in `.env` (git-ignored). Never commit keys, tokens, or `data/`.
8. **Do not rewrite working code.** `packages/video` is existing, tested code (see `docs/VIDEO_SPEC.md`). Extend it. The only sanctioned restructuring is task T-045b (persistent Stage), done behind an `embedded` prop so existing compositions keep working. Motion rules: `docs/MOTION_STYLE.md`.
9. **Respect free-tier limits.** Budget per video: ≤ 8 LLM calls total. Cache every LLM/spec result per phone. Retries are capped (max 2).
10. **Local disk is limited.** Follow the retention policy in `docs/ARCHITECTURE.md` §7; never keep raw frames.
11. **Autopilot never forces a publish.** Unknown or doubtful data → exclude the category, skip the video, or use the parametric phone. Never lower thresholds, never fabricate values, never bypass an auto-judge (`docs/AUTOPILOT.md`).

## Stack
TypeScript everywhere. npm workspaces monorepo. Next.js (App Router) dashboard + route handlers, a separate Node worker process, SQLite (`better-sqlite3`, plain SQL migrations), Zod for all schemas, Remotion `@remotion/renderer` for rendering, Vitest for tests.

## Repo layout
```
apps/web/            Next.js dashboard + API routes (docs/UI_SPEC.md, docs/API.md)
apps/worker/         job runner (docs/PIPELINE_AND_JOBS.md)
packages/core/       zod schemas, verdict engine, validators, price/SoC logic
packages/ai/         LLM router (OpenRouter/Gemini/local), prompts, JSON-schema calls
packages/collectors/ spec collector, benchmark snapshots, image resolver, pair finder
packages/video/      Remotion project (existing code from comparison-video.zip)
packages/publisher/  adapter to ytagent
data/                runtime files (git-ignored): db, assets, renders, snapshots
docs/                specs (this folder)
```

## Working method
- Work on **one task** from `docs/IMPLEMENTATION_PLAN.md` at a time (IDs `T-xxx`). Do not start a task whose dependencies are not done.
- Before coding: restate the task's acceptance checks. After coding: run them and paste the result in your summary.
- Commands that must pass before you call a task done: `npm run typecheck`, `npm test`, plus the task's own check.
- Small commits, one task per commit: `T-014: verdict engine ranking rules`.
- If a spec is ambiguous or contradicts another doc, stop and list the conflict; do not choose silently. Precedence: `AGENTS.md` > `DATA_MODEL.md` > `VERDICT_RULES.md` > module spec > the rest.
- Prefer boring code: pure functions, explicit types, no clever abstractions, no new dependencies without a one-line justification.

## Definition of done (every task)
Typecheck clean · tests added and passing · no `any` without comment · errors surfaced to the job log (not swallowed) · docs updated if behavior changed · no secrets or `data/` committed.
