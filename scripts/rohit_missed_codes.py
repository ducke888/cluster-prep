#!/usr/bin/env python3
"""Print the performance-indicator codes of every question Rohit missed,
grouped by exam, for the chat response."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

DATA_DIR = Path("/Users/aryank/DECA Study Website/data")

seed = json.loads((DATA_DIR / "seed-rohit.json").read_text())

def extract_code(sources):
    for s in sources or []:
        m = re.search(r"([A-Z]{2,3})\s*:\s*(\d+)", s)
        if m:
            return f"{m.group(1)}:{m.group(2)}"
    return None

exam_titles = {
    "state-1":        "State Exam #1",
    "state-5":        "State Exam #5",
    "icdc-2014":      "ICDC 2014",
    "icdc-2016":      "ICDC 2016",
    "icdc-2018":      "ICDC 2018",
    "sample-exam-6":  "Sample Exam 6",
    "sample-exam-7":  "Sample Exam 7",
    "sample-exam-8":  "Sample Exam 8 (Q1–75)",
    "sample-exam-9":  "Sample Exam 9",
    "sample-16":      "Sample Exam 16 (Q1–50)",
}

# Exam ordering for display
order = [
    "state-1", "state-5",
    "icdc-2014", "icdc-2016", "icdc-2018",
    "sample-exam-6", "sample-exam-7", "sample-exam-8",
    "sample-exam-9", "sample-16",
]

topic_counter = Counter()
all_wrongs = []

for slug in order:
    qs = seed.get(slug, {})
    if not qs:
        continue
    exam = json.loads((DATA_DIR / f"{slug}.json").read_text())
    key = {q["number"]: q for q in exam["questions"]}
    # list of (qnum, chosen, correct, code)
    wrongs = []
    for n_str in sorted(qs, key=lambda x: int(x)):
        info = qs[n_str]
        if not info.get("wrong"):
            continue
        q = key.get(int(n_str))
        if not q:
            continue
        code = extract_code(q.get("sources"))
        wrongs.append((int(n_str), info["chosen"], q.get("answer"), code, q["question"]))
        if code:
            topic_counter[code.split(":")[0]] += 1
        all_wrongs.append((slug, int(n_str), code))

    print(f"### {exam_titles.get(slug, slug)}  — {len(wrongs)} missed")
    # Table-style
    for n, ch, right, code, stem in wrongs:
        codedisp = code or "—"
        stem_short = stem[:78].replace("\n", " ")
        print(f"  Q{n:>3}  {ch}→{right}   {codedisp:<9}  {stem_short}")
    print()

print("\n=== Summary by topic code prefix ===")
for prefix, cnt in topic_counter.most_common():
    print(f"  {prefix}: {cnt}")
print(f"\nTotal wrongs: {sum(topic_counter.values())} with codes + "
      f"{len([w for w in all_wrongs if not w[2]])} without codes")
