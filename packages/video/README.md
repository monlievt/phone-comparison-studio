# Comparison video (Remotion)

Data-driven category segments for phone comparison videos.

- Long 16:9 (`CategoryWide*`, `LongVideo*`) and Short 9:16 (`CategoryVertical*`, `ShortVideo*`)
- `*2` = 2 phones, `*3` = 3 phones (`phoneCount` is simply `comparison.phones.length`)
- Duration is computed from the spec text (`src/lib/timing.ts`), not hard-coded
- Audio: SFX fired from the same timeline as the animation + looping instrumental (no voice-over)

## Run

```
npm install
npm run audio      # generates placeholder SFX and music into public/ (replace with licensed files)
npm run dev        # Remotion Studio
npm run render:long3
npm run render:short2
```

## Benchmark segments

`BenchmarkSegment` is a generic segment for any benchmark source (AnTuTu, Geekbench, 3DMark, DXOMARK, ...).
Each entry in `comparison.benchmarks` has `source`, `version`, `updated`, a headline `main` score per phone and 0 to 4 breakdown `parts`.
A segment appears (8 s each) only when every phone has a score. `LongVideo*` shows all of them after the category segments;
`ShortVideo*` shows the first one. One segment = one source, never mix sources or versions.

`valueBenchmark(comparison)` derives a "Performance per dollar" segment (AnTuTu score / launch price USD) with no external source.
Stand-alone previews: `BenchmarkWide2/3`, `BenchmarkVertical2/3` (change `benchmarkIndex` in Studio).

## Data

`src/data/demo.ts` is fictional dummy data. Real data follows `src/types.ts`:
`ranking` is computed by the verdict engine (1 = best, equal numbers = tie), never by the AI.
A phone image must carry a `license`; `validateComparison` rejects it otherwise.
Without an image, a generic phone in the accent color is drawn.

## Next

Intro / score recap / outro, transitions between segments (`@remotion/transitions`), Short hook and final winner,
count-up numbers, Image Resolver that downloads licensed brand images into `public/`.
