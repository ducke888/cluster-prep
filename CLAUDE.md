# DECA IMCE Study Site

Study app for DECA Marketing Cluster Exam (ICDC prep).

## Layout
- **Vanilla app** (main): `app.html` + `app.js` (~2100 lines) + `styles.css`. Served by `node unified-serve.js` on :8765 locally (was Python http.server — swapped because it didn't send `Cache-Control: no-cache` on HTML, so browsers cached stale HTML and query-string `?v=` cache-busts looked broken).
- **React landing** (intro page only): `app-react/` — Vite + React + TS + Tailwind v4 + shadcn-style. `npm run dev` on 5173. Entry: `src/App.tsx` → `ShaderAnimation` + `CinematicHero`. CTAs redirect to vanilla app.
- **Data**: `data/*.json` (41 parsed exams + `seed-aryan.json`, `seed-rohit.json`, `index.json`).
- **Scripts**: `scripts/parse_exams.py`, `parse_more_exams.py`, `parse_rohit_logs.py`, `topic_concept_scan.py`.
- **Launch configs**: `.claude/launch.json` (`study-site` 8765, `react-landing` 5173).

## Routing (vanilla, hash-based)
`#/` home · `#/exam/<slug>/<qnum>` · `#/stats/<start|site|tests>` · `#/study/<topic>/<sub>` · `#/welcome`

## Data model (localStorage, per-user)
Key pattern: `deca-imce:user:<name>:<bucket>:<slug>` via `userScope()` (returns `state.user || "_guest"`).
Three buckets — keep separate, never mix:
- `progress:` — on-site answers (questions user took here)
- `logTest:` — imported test-log PDFs/TXTs (Aryan/Rohit seeds)
- `manualCodes` — pasted raw codes
- `study:` — Study-tab attempts (isolated so answers don't leak to main exam)

## Key features
- Username-only profile (no password), per-user isolation.
- Wrong-answer tracking by PI code prefix (BL/CM/IM/PR/PM/etc.).
- Stats has 3 sub-pages: Starting point, Site progress, Tests completed.
- Grade-at-end toggle (`state.gradeAtEnd` + `state.submitted`) for real test-mode.
- Study tab: `TOPIC_GUIDES_V2` (20 topics). `_OTHER`/Uncoded always sorted last.
- "Review wrongs" shows prev-pick badge only **after** user answers (no spoilers).

## Theme
Purple, not red. `--red: #7c3aed`, `--red-dark: #5b21b6`, `--red-light: #a78bfa`, `--bad: #dc2626` (kept red for wrong-answer semantics only).

## Pending
**AI tutor bot** — interactive per-topic teaching, $1/user/day hard cap, DECA-only scope gate, Node proxy holds Anthropic key. 7 protection layers (char limits, server proxy, scope gate, system prompt, budget cap, token counting, tool-use). Not started.

## Conventions
- Don't mix data buckets.
- Seed imports → `logTest:`, never `progress:`.
- New markdown/docs: only when explicitly asked.
- Big searches: use Agent/Explore subagents.
