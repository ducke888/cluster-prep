#!/usr/bin/env python3
"""
Data repair: fixes questions where the PDF had a 2-column A/C, B/D layout
and the parser concatenated columns instead of splitting them.

Corruption pattern:
    A = "realA C. realC"
    B = ""
    C = "realC B. realB"
    D = "realD"

Fix:
    A = realA
    B = realB
    C = realC
    D = unchanged
"""
import json
import glob
import os
import re
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

SPLIT_C = re.compile(r"\s+C\.\s+")
SPLIT_B = re.compile(r"\s+B\.\s+")

def try_fix(opts):
    a = (opts.get("A") or "").strip()
    b = (opts.get("B") or "").strip()
    c = (opts.get("C") or "").strip()
    d = (opts.get("D") or "").strip()

    if b:
        return None  # nothing to fix
    if not a or not c or not d:
        return None

    a_parts = SPLIT_C.split(a, maxsplit=1)
    c_parts = SPLIT_B.split(c, maxsplit=1)
    if len(a_parts) != 2 or len(c_parts) != 2:
        return None

    real_a, real_c_from_a = a_parts
    real_c_from_c, real_b = c_parts

    # Sanity: the two "realC" extractions should agree (they might differ in
    # trailing punctuation — just require the shorter to be a prefix of the other)
    rca = real_c_from_a.strip().rstrip(".")
    rcc = real_c_from_c.strip().rstrip(".")
    if rca and rcc and (rca not in rcc and rcc not in rca):
        return None

    real_a = real_a.strip()
    real_b = real_b.strip()
    real_c = (real_c_from_c or real_c_from_a).strip()
    real_d = d

    if not (real_a and real_b and real_c and real_d):
        return None

    return {"A": real_a, "B": real_b, "C": real_c, "D": real_d}


def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.json")))
    total_fixed = 0
    total_unfixable = 0
    for path in files:
        name = os.path.basename(path)
        if name in ("index.json", "seed-aryan.json", "seed-rohit.json"):
            continue
        with open(path) as fh:
            doc = json.load(fh)
        qs = doc.get("questions", [])
        changed = 0
        unfixable = 0
        for q in qs:
            opts = q.get("options") or {}
            if (opts.get("B") or "").strip():
                continue
            fixed = try_fix(opts)
            if fixed:
                q["options"] = fixed
                changed += 1
            else:
                unfixable += 1
        if changed:
            with open(path, "w") as fh:
                json.dump(doc, fh, indent=2, ensure_ascii=False)
            print(f"{name}: fixed {changed}" + (f", still broken {unfixable}" if unfixable else ""))
        elif unfixable:
            print(f"{name}: NONE fixed, {unfixable} still broken")
        total_fixed += changed
        total_unfixable += unfixable
    print(f"\nTotal fixed: {total_fixed}")
    print(f"Still broken (manual review): {total_unfixable}")


if __name__ == "__main__":
    main()
