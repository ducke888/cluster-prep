# DECA IMCE Study Site

Study app for DECA Marketing Cluster Exam (ICDC prep).

## Layout
- **Vanilla app** (the whole site): `app.html` + `app.js` + `styles.css` + `bma-guides.js`. Served by `node unified-serve.js` on :8765 locally (was Python http.server — swapped because it didn't send `Cache-Control: no-cache` on HTML, so browsers cached stale HTML and query-string `?v=` cache-busts looked broken). Root `/` serves `app.html` directly — there is NO separate landing page. (A React landing in `app-react/` was removed; if you see references to it, they're stale.)
- **Data**: `data/*.json` (Marketing cluster exams + `index.json`); `data/bma/` (BMA), `data/ht/` (Hospitality & Tourism) — each with its own `index.json`; seeds `seed-aryan.json`, `seed-rohit.json`, `seed-shreyas.json`.
- **Scripts**: `scripts/parse_cluster_exams.py <cluster_id> <FILE_PREFIX> <title> [src_dir]` — generic MBAResearch-format parser; one command per new cluster. (`parse_exams.py`/`parse_bma_exams.py` are the older Marketing/BMA-specific versions.)
- **Launch configs**: `.claude/launch.json` (`study-site` 8765).

## Clusters (multi-cluster)
- Six clusters: **marketing** (`data/`), **bma** (`data/bma/`), **fin** Finance (`data/fin/`), **ep** Entrepreneurship (`data/ep/`), **ht** Hospitality & Tourism (`data/ht/`), **pfl** Personal Financial Literacy (`data/pfl/`). Guide globals: `TOPIC_GUIDES_V2` (marketing, inline) + `window.TOPIC_GUIDES_{BMA,HT,FIN,EP,PFL}` (separate `*-guides.js` files). Weights: `ICDC_WEIGHT_TABLE`, `{BMA,HT,EP,FIN,PFL}_WEIGHTS`.
- `CLUSTERS` registry in `app.js` + `state.cluster` (persisted `deca-imce:cluster`, default `marketing`). Header dropdown (`#cluster-slot`) switches clusters; `switchCluster()` reloads that cluster's exam index and re-renders.
- Home exam list sorts newest-first via `byRecency` (year-stamped exams desc, undated sample exams at the bottom).
- **Cross-cluster practice** (opt-in, `state.crossCluster`, persisted `deca-imce:crossCluster`, shared by Study + Question Bank):
  - Study tab Same-code practice: toggle pulls same-PI-code questions from OTHER clusters (`crossClusterSameCode()`, skips clusters whose weights lack the prefix, dedups by stem).
  - Question Bank: "🌐 All clusters" toggle pools every cluster's exams (via `loadAllClusterIndexes()` + `getExamByMeta()`), deduped by stem (active cluster wins).
  - Pure practice — `setStudyState()` only mirrors to `progress:`/leaderboard when the slug is in the active cluster's index, so cross-cluster answers never pollute another cluster's stats. `qbankClassify()` treats `<cluster>-YYYY` slugs as ICDC.
- `FM` = Financial-Information Management (Finance cluster). Marketing MK exams that duplicate existing `sample-exam-*` content were skipped on import; genuinely new ones added as `mkt-YYYY`.
- Per cluster: own exam index (`indexUrl`), study guides, and ICDC blueprint weights. `activeCluster()` / `activeGuides()` / `activeWeights()` are the accessors — use these, not the raw consts.
- Marketing guides: `TOPIC_GUIDES_V2` (inline in app.js). BMA: `window.TOPIC_GUIDES_BMA` (`bma-guides.js`). H&T: `window.TOPIC_GUIDES_HT` (`ht-guides.js`). Per-cluster guide files load via `<script>` before app.js. Weights: `BMA_WEIGHTS`, `HT_WEIGHTS` (derived from each cluster's PI-prefix frequency).
- To add a cluster: parse PDFs → `data/<id>/`, author guides → `<id>-guides.js` (script tag in app.html), add a `CLUSTERS.<id>` entry + weights + `CLUSTER_ORDER` entry.
- Exam slugs are unique per cluster (`sample-exam-N`/`icdc-YYYY` vs `bma-YYYY`), so per-user progress/wrong-answer keys stay naturally separated. Leaderboard is per-cluster: Firestore doc id `"<cluster>__<user>"` with `cluster`/`name` fields; reads filter to the active cluster.

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
- Username **+ password** login (salted SHA-256 hash in the synced profile), per-user isolation. Defaults seeded for aryan/rohit/shreyas.
- Wrong-answer tracking by PI code prefix (BL/CM/IM/PR/PM/OP/SM/etc.).
- Stats has 3 sub-pages: Starting point, Site progress, Tests completed.
- Grade-at-end toggle (`state.gradeAtEnd` + `state.submitted`) for real test-mode.
- Study tab: per-cluster guides via `activeGuides()`. Sub-tabs: Study guide, Flashcards, Review wrongs, Same-code practice. `_OTHER`/Uncoded always sorted last.
- "Review wrongs" shows prev-pick badge only **after** user answers (no spoilers).
- ICDC countdown targets the next ICDC (currently 2027 Anaheim, `ICDC_EXAM_ISO`).

## Theme
Purple, not red. `--red: #7c3aed`, `--red-dark: #5b21b6`, `--red-light: #a78bfa`, `--bad: #dc2626` (kept red for wrong-answer semantics only).

## Removed
- **React landing** — deleted; root serves the vanilla app directly.
- **AI tutor bot** — removed entirely (client UI + `/api/tutor` server proxy). Don't reintroduce without an explicit ask.

## Conventions
- Don't mix data buckets.
- Seed imports → `logTest:`, never `progress:`.
- New markdown/docs: only when explicitly asked.
- Big searches: use Agent/Explore subagents.
