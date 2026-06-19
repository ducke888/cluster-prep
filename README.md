<div align="center">

<img src="favicon.svg" width="84" height="84" alt="ClusterPrep logo" />

# ClusterPrep

**Free practice for the DECA Career Cluster competitive exams.**

6 clusters · 89 practice exams · ~8,900 answer-keyed questions · study guides · flashcards · leaderboards

[![Live](https://img.shields.io/badge/live-clusterprep.site-7c3aed?style=flat-square)](https://clusterprep.site)
[![Built with Vanilla JS](https://img.shields.io/badge/built%20with-vanilla%20JS-f7df1e?style=flat-square)](#tech-stack)
[![Firebase](https://img.shields.io/badge/sync-Firebase%20Firestore-ffca28?style=flat-square)](#tech-stack)
[![Deploy on Render](https://img.shields.io/badge/hosting-Render-46e3b7?style=flat-square)](https://render.com)

</div>

---

## What it is

ClusterPrep is a study web app for DECA's cluster exams (the multiple-choice tests used to qualify for and compete at ICDC). It pulls together real MBA Research sample exams across **six clusters**, adds plain-English study guides and flashcards, and tracks what you get wrong so you can target your weak areas.

It's a single-page app with no build step — vanilla HTML/CSS/JS served by a tiny dependency-free Node server, with Firebase Firestore for cross-device sync and leaderboards.

> **Live:** [clusterprep.site](https://clusterprep.site) (currently a private beta — access is gated)

## Clusters covered

| Cluster | Exams | Questions |
|---|--:|--:|
| Marketing | 40 | 3,996 |
| Business Management & Administration | 10 | 1,000 |
| Finance | 10 | 1,000 |
| Hospitality & Tourism | 10 | 1,000 |
| Personal Financial Literacy | 10 | 1,000 |
| Entrepreneurship | 9 | 900 |
| **Total** | **89** | **8,896** |

Every question carries its official answer key, explanation, and performance-indicator (PI) code.

## Features

- **Six clusters, one app** — switch clusters from the header; each has its own exams, study guides, and ICDC blueprint weighting.
- **Full practice exams** — answer-keyed, with explanations and source PIs.
- **Study guides & flashcards** — per-cluster, written in a tutoring voice.
- **Wrong-answer tracking** — grouped by PI code prefix (BL, CM, IM, PR, etc.) so you can see exactly where you're weak.
- **Review wrongs** — re-drill missed questions (no answer spoilers until you commit).
- **Cross-cluster practice** *(opt-in)* — pull same-PI-code questions from other clusters without polluting your per-cluster stats.
- **Stats** — starting point, on-site progress, and tests completed.
- **Per-cluster leaderboards** — synced across devices.
- **Test mode** — grade-at-end toggle that mimics the real exam.
- **Accounts** — username + password (salted SHA-256), per-user data isolation, cross-device sync.
- **ICDC countdown** to the next International Career Development Conference.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, hash-based routing, no framework, no build step |
| Server | `unified-serve.js` — a zero-dependency Node static server |
| Sync / data | Firebase Firestore (profiles, leaderboards), `localStorage` for per-user state |
| Hosting | Render, custom domain `clusterprep.site` |
| Exam ingestion | Python + [PyMuPDF](https://pymupdf.readthedocs.io/) scripts that parse MBA Research-format exam PDFs |

## Project layout

```
app.html            # entry point (served at /)
app.js              # all app logic (routing, exams, stats, sync, auth)
styles.css          # styling (purple theme)
*-guides.js         # per-cluster study guides (bma, ht, fin, ep, pfl)
unified-serve.js    # static file server for local + Render
data/               # Marketing exams + index.json
data/<cluster>/     # other clusters, each with its own index.json
scripts/            # Python PDF-parsing tools
privacy.html        # Privacy Policy
terms.html          # Terms of Service
```

## Content & affiliation

Practice content originates from **MBA Research Center** sample exams and remains the property of its owners; it's provided here for personal, non-commercial study. ClusterPrep is an independent project and is **not** affiliated with, sponsored by, or endorsed by **DECA Inc.** or **MBA Research**. See the [Privacy Policy](https://clusterprep.site/privacy.html) and [Terms of Service](https://clusterprep.site/terms.html).
