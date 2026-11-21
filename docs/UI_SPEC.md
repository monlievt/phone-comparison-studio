# Dashboard UI spec

Tech: Next.js, Tailwind, no component library required. Desktop-first (laptop/tablet), dark-neutral theme. Each page needs loading, empty, and error states.

| Page | Content | Key behavior |
|---|---|---|
| Login | password field | rate-limited |
| Home | counters (queue, failed, awaiting Gate), LLM quota bars, disk free, recent comparisons | click-through to gate |
| Topics (Gate 0) | table of proposed pairs: phones, price gap, SoC tier gap, release, score, reasons; buttons Approve / Reject / Create video; button "Find topics" (filters: price band, SoC gap, count) | approving creates comparison |
| New video | pick 2–3 phones (autocomplete from `phones`, or free text), formats Long/Short | 3rd phone optional |
| Gate A: data | per-phone columns × category rows; cell shows display value, source link, confidence dot (green ≥0.8, yellow 0.4–0.8, red <0.4/conflict); inline edit; "exclude category" toggle; images row with license badge and "use generic" button; benchmarks block with source/version/period; price block with note; Approve button disabled until: no red cells, no blocked images in use | edits call PATCH specs |
| Gate B: video | Long and Short players, automatic checks list (pass/fail), copy editor (titles, description, tags, hook), Approve | edits to copy re-render only Intro/Outro/Hook text, else full re-render |
| Publish | choose title (5 options), visibility, schedule, shows credits; "Send to uploader" | status of handoff, link when published |
| Library | all comparisons with status, links | |
| Settings | categories on/off + weights, durations, brands + terms status (`allowed` true/false), benchmark permissions, providers order and models, theme (accent defaults), music library, disk limits, ytagent handoff mode/path | |
| Jobs | job list, per-job log, retry from stage | |

Accessibility: keyboard-reachable buttons, visible focus, color never the only signal (icons + text).
