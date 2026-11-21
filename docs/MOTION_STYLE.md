# Motion style (adapted from bang-motion, MIT, https://github.com/bangtutorial/bang-motion)

Borrowed: **design rules only**. Not borrowed: its HTML/GSAP/Three.js runtime, CDN scripts, image generation (never generate phone images), or its starters. All motion is implemented in Remotion (`packages/video`), deterministic, driven by `useCurrentFrame()`.

## 1. Problem to fix
Current `LongVideo`/`ShortVideo` = `Series` of independent category segments, each with its own background and phones entering again. That is a slide deck with animation. Goal: one continuous world where the phones stay and the content changes around them.

## 2. Rules (each has a mechanical check, see §5)
| # | Rule | Implementation in Remotion |
|---|---|---|
| M1 | **Persistent subject**: phones are on screen > 60% of total duration | New `Stage` component outside `Series` holds `Background` + `PhoneMock`s; segments render only title + stat cards. Phone position/scale follow a timeline (`stagePlan`), not per-segment springs |
| M2 | **Camera rig**: a wrapper (`CameraRig`) scales/translates the whole world; always a slow breathing drift (≤ 2% scale, ≤ 12 px, sine, no jerks); at least one clear shot-size change per 3 segments (push to the phone/stat, then pull back) | `CameraRig` reads `cameraPlan` per segment |
| M3 | **Overlapping choreography**: outgoing elements leave while incoming enter (overlap 6–12 frames). Enter slow-firm (20–38 frames, ease-out strong), exit fast (10–16 frames, ease-in). No symmetrical in/out | shared easing helpers in `lib/motion.ts` |
| M4 | **Transition variety**: ≥ 2 kinds per video, ≥ 1 with depth; plain wipes ≤ 2; no fade-only between all cuts. Menu: object wipe (a phone/accent shape sweeps close to the lens, content swaps behind), card flip from depth, push-through (only when motivated, ≤ 1 per video), mask with brand/accent shape | `transitionPlan` generated from a seeded rotation |
| M5 | **Never reveal stage edges** (no translate that shows empty borders); no sudden spin/zoom+blur at every cut; no light leak on every cut (save for the winner reveal only) | review + check |
| M6 | **Background never still, ≥ 2 layers**: choose one *motion preset* per video from `gradientDrift`, `blobs`, `liveGrain`, `rotatingShapes`, `gridBreath`; plus a colored base from phone accents. Changes of color field happen behind a visible trigger (object wipe, cut on the beat) | `Background` gets prop `preset`; rotate so consecutive videos differ |
| M7 | **Max two text levels per segment**: category title + one stat per phone (the small secondary line counts as part of the stat card). No kicker/eyebrow/body copy | check via `data-text-level` attributes |
| M8 | **Text readable on phones**: ≥ 40 px at 1080 wide (hard floor 30), strong contrast on any accent, no text on busy areas | existing `fit()`; check |
| M9 | **One special moment** per video (winner reveal); expensive effects used once, not every segment | `Outro`/`ShortWinner` only |
| M10 | **Hierarchy of attention**: title → phones → values → badges. Never a badge before the title | timeline order test |
| M11 | **Style fingerprint differs from the previous video**: record `{motionPreset, transitionSet, musicTrack, accentOrder}`; reject identical to the last one | stored in `comparisons.theme_version`/settings; also reduces "repetitive content" risk (`COMPLIANCE.md`) |

Brand skin is still open (`OPEN_ITEMS.md` #10). Until decided: neutral theme (existing), accent colors from phones, one of the presets above. Existing look is already near "poster color-block / flat pop"; keep it.

## 3. Decisions the owner can make (optional)
Pick 1 preset as default and the rotation set; pick whether titles stay UPPERCASE or sentence case (bang-motion advises sentence case, weight 500, emphasis by size/pause; test both on a still).

## 4. Compatibility
`CategoryWide*`/`CategoryVertical*` compositions stay working as standalone previews (add prop `embedded?: boolean`; when true they render only the content layer). `LongVideo*`/`ShortVideo*` switch to `Stage + CameraRig + segments`. Existing data contract does not change.

## 5. Mechanical checks (extend T-047)
1. `heroVisibleFraction ≥ 0.6` (computed from `stagePlan`).
2. Text levels per segment ≤ 2 (count `data-text-level` unique values in a rendered still DOM).
3. Distinct transition kinds ≥ 2 and plain wipes ≤ 2 (from `transitionPlan`).
4. No dead second: sample frames 15 apart inside each segment, mean absolute pixel difference > threshold (tuned in T-047).
5. Min font size ≥ 30 px (target 40) via computed styles in the debug mode.
6. Fingerprint differs from previous video.
