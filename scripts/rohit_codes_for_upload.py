#!/usr/bin/env python3
"""Emit a JSON array of manualCodes entries for every coded wrong answer
Rohit has in his seed. Format matches what app.js stores under
`deca-imce:user:rohit:manualCodes`:

    [{"code": "BL:074", "addedAt": 1729200000000}, ...]

We also print a bash snippet to inject directly via preview_eval.
"""
from __future__ import annotations
import json
import re
import time
from pathlib import Path

DATA = Path("/Users/aryank/DECA Study Website/data")
seed = json.loads((DATA / "seed-rohit.json").read_text())

def extract_code(sources):
    for s in sources or []:
        m = re.search(r"([A-Z]{2,3})\s*:\s*(\d+)", s)
        if m:
            return f"{m.group(1)}:{m.group(2)}"
    return None

codes = []
now = int(time.time() * 1000)
for slug, qs in seed.items():
    exam = json.loads((DATA / f"{slug}.json").read_text())
    key_by_num = {q["number"]: q for q in exam["questions"]}
    for nstr, info in qs.items():
        if not info.get("wrong"):
            continue
        q = key_by_num.get(int(nstr))
        if not q:
            continue
        code = extract_code(q.get("sources"))
        if code:
            codes.append({"code": code, "addedAt": now})

print(f"// {len(codes)} codes from Rohit's wrongs")
print(json.dumps(codes, ensure_ascii=False))
