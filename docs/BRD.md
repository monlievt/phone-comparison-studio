# BRD (condensed)

## Problem
A phone comparison video takes 4–8 hours by hand (research, specs, editing, thumbnail, upload). Manual copying causes wrong numbers, which destroy viewer trust.

## Goals
| ID | Goal | Indicator |
|---|---|---|
| BO-1 | Cut human time per video | < 30 min (two approvals) |
| BO-2 | Raise cadence | 3–5 videos/week, one operator |
| BO-3 | Accuracy | < 2% number corrections after publish |
| BO-4 | Consistent look | Same theme in all videos |
| BO-5 | Zero cost | $0 recurring; LLM calls per video tracked |

## Scope (v1, "complete MVP")
In: AI-proposed phone pairs/trios (owner approves), spec/price/benchmark collection with sources, image resolver with license, deterministic verdict, English copy, Long + Short render, thumbnail, handoff to ytagent for upload and scheduling, local dashboard.
Out: voice-over, hands-on footage, own benchmarking, multi-channel, monetization, manual video editing, paid services.

## Stakeholders
Owner/operator (same person, approves at gates), viewers (need accurate, readable video).

## Constraints
- $0 budget; one local computer; free LLM APIs with request caps (see `ARCHITECTURE.md` §5).
- Free-tier LLM providers may use prompts for training: send only public spec data, never secrets.
- Legal: see `COMPLIANCE.md`. Image and benchmark reuse rights are unverified by default.

## Assumptions
Global English audience; USD launch prices (MSRP, converted values marked approx.); global variants unless stated; one channel; uploader already exists (`ytagent`).
