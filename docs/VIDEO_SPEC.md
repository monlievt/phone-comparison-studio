# Video spec

## 1. Existing code (`packages/video`, from comparison-video.zip) — do not rewrite
Remotion 4.0.542, React 19, fonts bundled (Barlow Condensed, Manrope), 30 fps.
Compositions in `Root.tsx`: `CategoryWide{2,3}`, `CategoryVertical{2,3}`, `BenchmarkWide{2,3}`, `BenchmarkVertical{2,3}`, `LongVideo{2,3}`, `ShortVideo{2,3}`.
Key files: `types.ts` (contract), `lib/timing.ts` (durations: 6 s for 2 phones, 7 s for 3, +1 s if longest text > 16 chars, +1 more if > 28; benchmark segment 8 s), `lib/rank.ts` (`subset`, `pickShortCategories`), `lib/benchmark.ts` (`valueBenchmark` etc.), `lib/validate.ts`, components (`PhoneMock`, `StatCard`, `RankBadge`, `VsBadge`, `NameBar`, `Background`, `Sfx`, `Music`, `Watermark`).
Known gaps (from its README): no intro, recap, outro, transitions, Short hook/winner, count-up numbers, thumbnail; audio files are placeholders; `PhoneMock` uses `<Img src>` directly; data is dummy.
Theme: neutral, `showWatermark=false`, accents come from each phone.

## 2. Compositions to add
| Composition | Spec |
|---|---|
| `Intro` (Long) | 5 s. Phones enter, title `{A} vs {B}`, VS badge, price row ("Launch price"). Uses `title` and `priceUSD`. |
| `ScoreRecap` (Long) | 8 s. Overall points per phone from `overall`, rank badges, per-category win count. |
| `Outro` (Long) | 6 s. Overall winner (or "Tie"), neutral call-to-action text from theme (no channel name yet). |
| `ShortHook` | 2 s. Two/three phones, `hook` text, VS badge. |
| `ShortWinner` | 3 s. Overall winner. Loop-friendly end. |
| `Transitions` | `@remotion/transitions` slide/fade 10–14 frames between segments in `LongVideo`/`ShortVideo`; durations must be subtracted correctly from total (`calculateMetadata`). |
| `Thumbnail` (Still 1280×720, < 2 MB) | Phones, ≤ 4-word text (`PROMPTS.md` §4), VS badge, high contrast. Export PNG or JPG ≤ 2 MB. |
| Count-up numbers | in `StatCard`/benchmark totals; tabular figures; deterministic. |

Totals: `Long = Intro 5 + Σ categories + Σ benchmarks (8 each) + Recap 8 + Outro 6`; `Short = Hook 2 + n×category + (≤1 benchmark) + Winner 3`, ≤ 50 s. Durations live in `theme`/settings.

## 3. Quality rules
Text min ≈ 40 px at 1080p, 5% safe margin, `fit()` for long strings, no text overlapping phone screens, phone screens show neutral wallpaper (never ads), image fallback generic mock, tie → all ticks.

## 4. Thumbnail generation
`renderStill` per format needed (Long thumbnail only; Short uses auto frame). Output `data/renders/<id>/thumb.png`; if > 2 MB convert to JPG quality ≤ 85.

## 5. Audio
- SFX map (same timeline as animation, existing `Sfx`): phone in → whoosh; title → pop/swoosh; values → tick; VS → impact (add `impact.wav`); winner → ding; transition → swoosh; recap → riser + ding (add `riser.wav`).
- Music: 3–5 instrumental tracks in `public/music/`, one chosen per video (round-robin stored in settings); fade in/out; level ≈ −20 to −18 LUFS under SFX; no voice so no ducking. Short: trim to ≤ 50 s with strong start.
- **Replace placeholders** with commercially licensed or CC0/own-made files; record license per file in `public/music/LICENSES.json` (`file, license, source, url, accessedAt`). Render must fail if a track lacks an entry. `TODO-KONFIRMASI`: source of tracks.

## 6. Automated checks (`packages/video/checks`)
1. Render stills at the midpoint of every segment (low res) via `renderStill`.
2. Text overflow: inject a debug mode that measures bounding boxes of elements marked `data-check="text"` and fails when any exceeds its container or the safe area (use Playwright/Chromium that Remotion already provides or `getBoundingClientRect` inside a test composition).
3. Audio: run `ffmpeg -i out.mp4 -af ebur128=peak=true -f null -` (ffmpeg ships with Remotion's compositor binary; use `npx remotion ffmpeg`); parse integrated loudness and true peak.
4. Duration within `[min,max]` from settings.

## 7. Render settings
Preview: scale 0.4, crf 32, `concurrency` ≈ half of CPU cores. Final: 1080p/1080×1920, crf 18–20, h264, aac. Worker holds a global render lock. Measure and store timings per format (T-041).

## 8. Parametric phone (replaces the single generic mock)
Component `ParametricPhone` (SVG/CSS, deterministic) draws the **front view** from `PhoneShape`: body proportions from `bodyMM` (relative scale between phones in the same video preserved: a bigger phone is drawn bigger), computed bezels, corner radius ~ typical, front-camera style (punch center/left/right, water-drop, notch, pill, under-display = none), flat vs curved-edge highlight, flat vs round frame, body color from `accent` (neutral tone, no brand colorways), neutral wallpaper on screen. **No brand logos, no brand-specific design copying.** A small "Illustration" label appears in the Intro and the description.
`PhoneMock` keeps working: if `image` exists and is licensed it is used; otherwise `ParametricPhone` (not the old generic). Unknown fields use defaults (`DATA_MODEL.md` §6). Never blocks rendering. Rear view/camera-module layout is out of MVP scope.
Checks: unit tests on bezel math; golden stills for 6 shape combinations; two phones of different `bodyMM` keep their relative size.
