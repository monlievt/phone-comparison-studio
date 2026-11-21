# Prompts and JSON schemas

Rules: English only; always request JSON matching a Zod schema; temperature 0–0.2 for data, 0.6 for copy; store `prompt_id` + `version` + provider + model with each result; never include secrets; max 2 attempts, validate with Zod, and on schema failure retry once with the validation error appended.

## 1. `spec_extract@v1` (1 call per phone)
System: "You extract phone specifications from the supplied page text. Use ONLY the text. If a value is not stated, return null. Never guess or use outside knowledge. For each field return the value and a verbatim evidence snippet (max 20 words) copied from the text. Output JSON only."
User: `PHONE: {brand} {model} {variant}\nTEXT:\n{pageText}\nFIELDS: {categoryKeysWithUnits}`
`fields` also includes `shape` (see `DATA_MODEL.md` §6): body size, screen inch/aspect, front camera style, edge, frame, rear lens count, each with verbatim evidence or null.
```ts
SpecExtract = { phone: {brand:string, model:string, variant:string|null, releaseDate:string|null, soc:string|null,
  priceUSD:number|null, priceCurrencyOriginal:string|null, priceOriginal:number|null},
  fields: Record<categoryKey, {value:string|null, evidence:string|null}> }
```
Post-check in code (see `MODULES.md` §2.4).

## 2. `pair_propose@v1` (optional, 1 call, cached 7 days)
System: "List smartphones launched in the last 12 months. Use web search if available. Return only real models you can cite; each with official page URL. If unsure, omit." Output: `{phones:[{brand,model,variant,approxPriceUSD,soc,sourceUrl}]}`. Everything returned is a **candidate** to verify, never trusted data.

## 3. `copy_all@v1` (1 call per comparison)
Input: approved `final_json` reduced to `{phones:[{name,priceUSD}], categories:[{key,label,winnerNames,tie}], overall, benchmarks:[{title,winnerName}]}`.
System: "You write short English YouTube copy for a phone comparison channel. Use ONLY facts and numbers present in the input. No superlatives unless the input shows a clear winner. No clickbait lies. Titles ≤ 60 characters."
```ts
CopyAll = {
  titles: string[5],                 // Long titles
  shortTitles: string[3],            // Short titles, each ends with " #Shorts" added by code, not by AI
  hook: string,                      // <= 40 chars, e.g. "Same price. Who wins?"
  description: string,               // 2 short paragraphs, no chapters (code adds them)
  tags: string[],                    // 8–15
  hashtags: string[],                // <= 3
  categoryNotes: Record<categoryKey, string>   // <= 6 words each, optional
}
```
Post-check: `validateNumbers`; title length; forbidden words list (`best ever`, `destroys`, etc. configurable); phone names must match data exactly.

## 4. Thumbnail text
Not AI: pick from templates `["WHO WINS?", "SAME PRICE?", "{A} vs {B}"]` by rule; max 4 words.

## 5. Quota-out fallback
If no provider available: skip `pair_propose`; for specs, block with clear message (manual entry at Gate A still works); for copy, use templates (§6).

## 6. Templates (code)
- Title: `{A} vs {B}: Which Wins? ({year})`; trio: `{A} vs {B} vs {C}: Which One?`
- Description: facts table generated from data + credits + `Data sources:` list.
- Tags: brands, models, `vs`, "phone comparison", year.
