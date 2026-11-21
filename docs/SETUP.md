# Setup (local, $0)

## Requirements
Node.js LTS (≥ 20), npm, Git, ~10 GB free disk minimum (20 GB recommended), internet for first Remotion Chromium download and API calls. No Docker needed.

## Steps
```
git clone <this repo> && cd <repo>
cp .env.example .env     # fill values
npm install
npm run db:migrate
npm run audio            # only if you still use placeholder audio (replace with licensed files)
npm run dev:all          # starts web (http://127.0.0.1:3000) and worker
```
Scripts expected at repo root: `dev:all`, `dev:web`, `dev:worker`, `db:migrate`, `typecheck`, `test`, `e2e`, `video:studio` (Remotion Studio).

## `.env.example`
```
APP_PASSWORD=change-me
SESSION_SECRET=generate-a-long-random-string
DATA_DIR=./data
BIND_HOST=127.0.0.1

# LLM providers (order and models are in config/ai.json, not here)
GEMINI_API_KEY=            # free key from Google AI Studio (NOT the Gemini app subscription)
OPENROUTER_API_KEY=        # free account key; use only ":free" models
OLLAMA_BASE_URL=           # optional local fallback, e.g. http://127.0.0.1:11434

# Limits (verify in provider dashboards; enforced by llm_usage counter)
LLM_CALLS_PER_VIDEO=8
OPENROUTER_DAILY_LIMIT=50
GEMINI_DAILY_LIMIT=         # fill from AI Studio

# Rendering
RENDER_CONCURRENCY=         # default: half of CPU cores
MAX_DISK_GB=20

# Publisher (see docs/YTAGENT_INTEGRATION.md once written)
PUBLISH_MODE=folder         # folder | http | manual
YTAGENT_WATCH_DIR=
YTAGENT_BASE_URL=
```

## `config/ai.json` (example)
```json
{"providers":[
 {"id":"gemini-free","kind":"gemini","model":"TODO-CHECK-AI-STUDIO","supportsGrounding":true},
 {"id":"openrouter-free","kind":"openrouter","model":"TODO-pick-a-:free-model","fallbackModels":[]},
 {"id":"local","kind":"ollama","model":"TODO","enabled":false}],
 "perVideoCallCap":8}
```
Model names must be looked up at setup time (free models rotate). Never commit a key.

## Working with Antigravity
Open the repo root as the workspace so `AGENTS.md` is picked up (if your version expects rules in a workspace rules folder, copy `AGENTS.md` there as well). Give the agent one task ID at a time from `docs/IMPLEMENTATION_PLAN.md`; ask it to list acceptance checks first and to stop on `TODO-KONFIRMASI`.
