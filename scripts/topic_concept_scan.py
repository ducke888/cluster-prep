#!/usr/bin/env python3
"""Scan every exam JSON for each topic prefix: collect unique codes + a
one-line phrase from each distinct code. Output: a Python-literal dict we can
paste into app.js for comprehensive guides."""
from __future__ import annotations
import json
import re
from collections import defaultdict
from pathlib import Path

DATA = Path("/Users/aryank/DECA Study Website/data")

# Maps prefix -> dict(code -> {stem_example, answer_explanation})
topics = defaultdict(dict)

for jf in sorted(DATA.glob("*.json")):
    if jf.name == "index.json": continue
    if jf.name.startswith("seed-"): continue
    if jf.name == "rohit-manual-codes.json": continue
    try:
        exam = json.loads(jf.read_text())
    except Exception:
        continue
    for q in exam.get("questions", []):
        src = " ".join(q.get("sources", []))
        m = re.search(r"([A-Z]{2,3}):(\d+)", src)
        if not m: continue
        prefix = m.group(1)
        code = f"{prefix}:{m.group(2)}"
        # Title: first noun in explanation or first 10 words of stem
        expl = (q.get("explanation") or "").strip()
        title = expl.split(".")[0].strip() if expl else q["question"][:80]
        # Sanity: keep short
        title = re.sub(r"\s+", " ", title)[:140]
        if code not in topics[prefix]:
            topics[prefix][code] = title

# Print summary
for prefix in sorted(topics):
    codes = topics[prefix]
    print(f"=== {prefix}  ({len(codes)} unique codes) ===")
    for code, title in sorted(codes.items()):
        print(f"  {code}  {title}")
    print()
