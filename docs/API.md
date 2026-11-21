# API (Next.js route handlers, JSON, all behind owner session)

Errors: `{error:{code,message,details?}}` with proper HTTP status. All bodies validated with Zod from `packages/core`.

| Method + path | Body / query | Response |
|---|---|---|
| POST `/api/login` | `{password}` | sets httpOnly cookie |
| GET `/api/health` | — | `{db,diskFreeGB,renderBusy,llm:{provider,used,limit}[]}` |
| GET `/api/topics` | `?status=` | `Topic[]` |
| POST `/api/topics/find` | `{priceBand?, socTierGap?, count?}` | `{jobId}` |
| POST `/api/topics/:id/approve` · `/reject` | — | `Topic` |
| POST `/api/comparisons` | `{phones:[{brand,model,variant?}] (2–3), formats:['long','short'], topicId?}` | `Comparison` (status CREATED) + collect jobs queued |
| GET `/api/comparisons` | `?status=` | list |
| GET `/api/comparisons/:id` | — | comparison + data + jobs + renders + publications |
| PATCH `/api/comparisons/:id/specs` | `{edits:[{phoneId,categoryKey,displayPrimary,displaySecondary?,source?}]}` | updated spec rows; invalidates downstream |
| PATCH `/api/comparisons/:id/images` | `{phoneId,action:'use_generic'|'set',imageId?}` | image row |
| POST `/api/comparisons/:id/approve-data` | — | Gate A (fails with 409 if unlicensed image used, unresolved low confidence, or parse errors) |
| PATCH `/api/comparisons/:id/copy` | `{titles?,description?,tags?,hook?}` | copy (re-validated) |
| POST `/api/comparisons/:id/approve-video` | — | Gate B |
| POST `/api/comparisons/:id/retry` | `{fromStage}` | jobs re-queued |
| POST `/api/comparisons/:id/publish` | `{visibility,publishAt?,title?}` | publication rows |
| GET `/api/files/:renderId` | — | streams MP4/PNG (range requests supported) |
| POST `/api/benchmarks/import` | multipart CSV + `{source,version,period,sourceUrl,permissionNote?}` | snapshot |
| GET/PUT `/api/settings` | settings object | settings |
| GET `/api/events/:comparisonId` | — | SSE: `job`, `progress`, `log`, `status` events |
