# Compliance checklist (not legal advice)

| Area | Rule | Enforced by |
|---|---|---|
| Phone images | Only official brand/press terms that allow reuse, or Wikimedia CC0/PD/CC BY (with attribution); unknown terms = blocked; no GSMArena-style sources without written permission; no watermark removal unless license allows modification | Image Resolver, Gate A |
| Benchmark data | Reuse rights unverified by default. Manual import allowed; auto-fetch only with permission noted per source; show source/version/month on screen; credit in description | `benchmark_snapshots.permission_note` |
| Spec data | Facts are not copyrightable but respect each site's terms; prefer official pages; polite fetching; robots.txt honored | Fetcher |
| Free LLM providers | Free tiers may use inputs for training and have request caps; send only public data | `packages/ai` |
| YouTube | Disclose realistic synthetic media if policy requires; avoid mass-produced repetitive content (unique segments, varied angles); first uploads private; API compliance depends on ytagent's project | Publisher defaults |
| Music/SFX | Commercial + monetization allowed; keep license record per file | `LICENSES.json`, render fails without it |
| Remotion | License depends on company size; check before commercial use at scale | Owner |
| Repetitive content | Vary motion preset, transitions, music per video (fingerprint rule M11) and keep unique data/commentary per video | `MOTION_STYLE.md` |
| Claims | No quality claims beyond data (e.g. megapixels ≠ photo quality); no unsupported superlatives | Prompt rules + validator |
