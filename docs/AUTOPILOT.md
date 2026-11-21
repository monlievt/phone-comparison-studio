# Autopilot (zero-touch operation)

Goal: after one-time setup, the system finds topics, builds, checks, renders, and hands videos to ytagent with no human action. Human gates become **automatic judges**. Principle: **when in doubt, skip or fall back; never publish unverified data and never lower thresholds to force a publish.**

## 1. One-time human decisions (cannot be automated)
Brand image/logo terms (`allowed` true/false per brand), benchmark permissions, API keys, ytagent path, autopilot settings. Everything else runs unattended. Items listed in `OPEN_ITEMS.md`.

## 2. Settings (`settings.autopilot`)
```json
{"enabled": true, "videosPerWeek": 4, "topicScoreMin": 60, "minCategories": 8,
 "requiredCategories": ["price","battery","display_type","chipset"],
 "criticalCategories": ["price","battery","refresh_rate","ram","charging"],
 "minConfidence": 0.8, "holdHours": 24, "maxConsecutiveFailures": 2,
 "dailyLlmReserve": 0.2, "notify": {"channel": "dashboard", "webhookUrl": null}}
```

## 3. Scheduler
Runs every hour: if `published+handedOff this week < videosPerWeek` and not paused and resources ok (disk, LLM quota above reserve) → `find_topics` (if no approved topic) → take the best topic ≥ `topicScoreMin` (Gate 0 auto) → run pipeline. One comparison at a time.

## 4. Auto-judges (replace the human gates)
**Data Judge (Gate A)** passes only if ALL hold:
1. Each included category has confidence ≥ `minConfidence`, no conflict. Others are **excluded automatically**, not guessed.
2. ≥ `minCategories` categories remain and all `requiredCategories` are present.
3. Every critical category value is either verified in the official page text, or two independent sources agree.
4. Price is USD launch price with a source (or approximate conversion with `fx_date`); else price category excluded and the video is skipped if price is required.
5. Pair still fits the Pair Finder filters after real data is in (price gap, same variant class).
6. No phone is below the data-coverage floor (e.g. SoC unknown → chipset excluded; if that breaks rule 2 → skip).
Fail → status `SKIPPED_LOW_DATA` with reasons, topic marked `rejected`, scheduler picks the next topic. No retry loops beyond the job caps.

**Video Judge (Gate B)** passes only if ALL automatic checks pass (`PIPELINE_AND_JOBS.md` + `MOTION_STYLE.md` §5): numbers validated, no overflow, loudness/peak, duration, motion checks, fingerprint differs from last video, all images licensed or generic. One automatic repair attempt (e.g. shrink text, switch motion preset, re-render once). Still failing → `FAILED_QA`, video discarded.
Optional (off by default, uses 1 LLM call): vision review of 6 stills for "text clipped / ugly overlap".

**Copy Judge**: `validateNumbers` + banned words + title length. Failing AI copy → template copy (never block publishing on copy).

## 5. Images, fully automatic
Order: (1) press-kit image via the brand's configured URL pattern **only if** `allowed:true`; (2) Wikimedia CC0/PD/CC BY; (3) **parametric phone** (see `VIDEO_SPEC.md` §8). Default for any brand with `allowed:null` is the parametric phone. Logos: brand name as text only; official logo only when `logoAllowed:true`. The optional `data/assets/inbox/` folder is still honored if files appear there, but is never required.

## 6. Publish
Default: hand off as **scheduled/private with `holdHours` delay** so there is a cancel window; if nobody cancels, it goes public. Setting `holdHours: 0` publishes immediately. A cancel button in the dashboard (or via webhook) stops it. The Short and Long are cross-linked.

## 7. Safety brakes (automatic)
- Pause autopilot after `maxConsecutiveFailures` QA failures/skip-streaks, quota exhaustion, low disk, uploader error, or render crash loop; resume manually or after the condition clears (quota resets, disk freed).
- Global kill switch in dashboard and `PAUSE` file in `data/`.
- Daily/weekly caps: videos per week, LLM calls per day (keep `dailyLlmReserve` unused for retries).
- Weekly digest (dashboard, optional webhook): videos made, skipped (with reasons), failures, quota use, disk.

## 8. Residual risks (accepted knowingly)
- A wrong number can still slip through if an official page is wrong or ambiguous. Mitigation is thresholds, two-source rule, and excluding doubtful categories.
- Fully automated, templated uploads can be classed as mass-produced/repetitive on YouTube. Mitigation: fingerprint rotation (M11), unique data per video, hold window. No guarantee.
- Free LLM limits may throttle output to about 1 video/day or less.
- Post-publish corrections are manual (fix via ytagent/YouTube Studio).
