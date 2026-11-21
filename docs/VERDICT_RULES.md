# Verdict rules (pure code, `packages/core/verdict`)

Winners and ranks are never produced by AI. Same input → same output.

## 1. Categories (default set, order = video order)
`rule`: `higher` / `lower` / `ordinal` (lookup table, higher index better). `tieEps` = values within this absolute (or relative `%`) difference tie. Weight is used for the overall score and Short selection.

| key | label (screen) | unit | rule | tieEps | weight | default on |
|---|---|---|---|---|---|---|
| display_type | Display type | — | ordinal | 0 | 2 | yes |
| resolution | Resolution | px (W×H → total pixels) | higher | 0 | 2 | yes |
| refresh_rate | Refresh rate | Hz | higher | 0 | 2 | yes |
| peak_brightness | Peak brightness | nits | higher | 5% | 2 | yes |
| chipset | Chipset | SoC tier | ordinal (soc tier table) | 0 | 3 | yes |
| ram | RAM | GB | higher | 0 | 2 | yes |
| storage | Storage | GB | higher | 0 | 1 | yes |
| battery | Battery | mAh | higher | 3% | 3 | yes |
| charging | Charging | W | higher | 0 | 2 | yes |
| main_camera | Main camera | MP (label states "MP") | higher | 0 | 2 | yes |
| selfie_camera | Selfie camera | MP | higher | 0 | 1 | yes |
| video_recording | Video recording | max mode | ordinal | 0 | 1 | yes |
| weight | Weight | g | lower | 2 g | 1 | yes |
| ip_rating | Water & dust | IP code | ordinal | 0 | 1 | yes |
| connectivity | Wi-Fi / NFC | composite | ordinal | 0 | 1 | no |
| software_support | Software updates | years | higher | 0 | 2 | yes |
| price | Launch price | USD | lower | 0 | 2 | yes |

Category skipped automatically when any phone's value is `null` or has unresolved low confidence. Owner may also disable categories in Settings. `TODO-KONFIRMASI`: owner confirms this list and weights.

Honesty rule: "Main camera" compares megapixels only and the label must say MP; no claims about image quality.

## 2. Ordinal tables (`config/ordinals.json`)
- display_type (low→high): `LCD (TN/VA)` < `IPS LCD` < `OLED` / `AMOLED` < `LTPO AMOLED`. (OLED and AMOLED equal rank.)
- video_recording: `720p30` < `1080p30` < `1080p60` < `4K30` < `4K60` < `8K24` < `8K30`.
- ip_rating: none < IP52/53/54 < IP64 < IP65 < IP66 < IP67 < IP68 < IP69 (digits compared: dust digit first, then water; treat `IPX8` as dust 0). Implement via parser, not string compare.
- chipset: `soc_tier` from `config/soc-tiers.json` (SoC name → integer tier, higher better). Seeded from a benchmark snapshot (e.g. AnTuTu SoC ranking, imported manually); owner can edit. Phones with unknown SoC → category skipped. `TODO-KONFIRMASI`: initial seed source.

## 3. Ranking algorithm
```
rank(v) = 1 + count(other values strictly better than v, after tie rule)   // competition ranking: 1,1,3
better(a,b): higher → a > b + eps ; lower → a < b - eps ; ordinal → idx(a) > idx(b)
```
- Equal ranks = tie → UI shows ticks for all tied winners (existing `RankBadge`).
- Parse display strings to numbers in `packages/core/parse.ts` (e.g. `5,000 mAh` → 5000, `120W` → 120, `2400×1080` → 2_592_000). Parsers are unit-tested; failing to parse → `null`, never a guess.

## 4. Overall score
`points_i = Σ_categories weight_c × (n − rank_i + 1)` (n = phone count). Overall rank by points; ties allowed. Benchmarks do **not** feed `points` (they are separate segments); `value` (performance per dollar) is its own segment.

## 5. Benchmark segments
- One source + one version per segment; show version and month on screen.
- Segment exists only if all phones have a score (existing `isComplete`).
- `valueBenchmark()` = main score ÷ `priceUSD` (already implemented); requires price on every phone.

## 6. Short selection
Use existing `pickShortCategories` (largest rank spread × 10 + weight). Max one benchmark in Short.

## 7. Tests (mandatory)
Table-driven tests per category: normal case, tie, three-way tie, null skip, eps edge, ordinal parse (`IP68` vs `IPX8`), unit parse variants.
