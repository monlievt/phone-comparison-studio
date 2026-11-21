# PRD

## Personas
- **Owner/Operator**: picks or approves topics, reviews data (Gate A) and video (Gate B). Not a coder.

## Main flow
1. **Topic discovery**: Pair Finder proposes pairs/trios (similar price band or similar SoC tier). → **Gate 0**: owner approves/rejects (can auto-approve above score threshold).
2. **Collect**: Collector gathers specs, USD launch price, benchmark scores, images, each with source + confidence.
3. **Gate A**: owner reviews data table (yellow = low confidence/conflict), edits, approves.
4. **Compute + copy**: Verdict engine ranks; Copy generator writes English titles/labels/description/tags.
5. **Preview render** (low resolution Long + Short).
6. **Gate B**: owner watches, edits text if needed, approves.
7. **Final render + thumbnail + metadata**.
8. **Handoff to ytagent** (private or scheduled). Status tracked.

## Features and priority (all in MVP)
| ID | Feature | Notes |
|---|---|---|
| F1 | Local dashboard, single owner login (password from `.env`) | no multi-user |
| F2 | Create comparison from 2 or 3 phones (manual or from approved topic) | |
| F3 | Pair Finder + Gate 0 | `MODULES.md` §1 |
| F4 | Spec Collector with sources, confidence, cache | §2 |
| F5 | Benchmark snapshots (manual import + optional fetch) | §3 |
| F6 | Image Resolver + license gate + generic fallback | §4 |
| F7 | Gate A data review/edit | `UI_SPEC.md` |
| F8 | Verdict engine (code) + number validator | `VERDICT_RULES.md` |
| F9 | Copy generator (English) | `PROMPTS.md` |
| F10 | Render Long + Short, preview and final | `VIDEO_SPEC.md` |
| F11 | Intro, recap, outro, Short hook/winner, transitions | `VIDEO_SPEC.md` |
| F12 | Thumbnail (Remotion Still) | |
| F13 | Metadata (titles ×5, description, tags, chapters) | |
| F14 | Gate B preview and approve | |
| F15 | Publisher adapter → ytagent | `MODULES.md` §9 |
| F16 | Job log, retry from failed stage | |
| F17 | Cost/usage meter (LLM calls per video, per provider) | |
| F18 | Settings: categories, weights, durations, music, providers | |
| F19 | **Autopilot**: scheduler, Data Judge, Video Judge, hold window, brakes (`AUTOPILOT.md`) | default mode; human gates become optional (`mode: manual`) |
| F20 | **Parametric phone** generated from specs (no photos needed) | `VIDEO_SPEC.md` §8 |

## User stories and acceptance
| As | I want | Accepted when |
|---|---|---|
| Owner | to see proposed pairs with reasons | list shows score, price gap, SoC tier gap, release date; approve in one click |
| Owner | to know where each number came from | each value shows source URL, date, confidence |
| Owner | to fix one number | edit re-ranks and re-renders only affected segments |
| Owner | no fake numbers | validator blocks render if any on-screen number is not in data |
| Owner | upload without manual steps | after Gate B, video appears in ytagent queue/private on YouTube |
| Owner | to retry a failed job | retry resumes from failed stage; earlier stages not repeated |
| Owner | to stay at $0 | dashboard shows LLM call count vs daily limit, blocks when exhausted |

## Non-functional
- Runs on one local machine; render concurrency 1.
- Preview Long ≤ 10 min, final ≤ 30 min on the target machine (measure in T-041; adjust).
- Idempotent stages; jobs survive restart.
- Text never clipped; contrast readable on phone; audio ≈ −14 LUFS, no clipping.
- Disk: see retention policy.

## MVP done when
In autopilot mode, with no human action, a topic is chosen, data judged, Long + Short rendered and judged, and handed to ytagent with a hold window; weak data causes a logged skip instead of a bad video. (Manual mode with Gates A/B remains available.) Bad data (unlicensed image, non-matching number) is rejected automatically. A failed job can be resumed.
