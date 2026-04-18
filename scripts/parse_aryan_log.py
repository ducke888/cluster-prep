#!/usr/bin/env python3
"""Parse Aryan's DECA IMCE ICDC Test Prep log into a wrong-answer seed.

The PDF is a hand-written log:

    Sample Exam 1 3/1/2026
    1. A
    2. B
    ...
    17. C wrong, didnt know what Confidentiality Statement was ...
    ...

For each answer line we capture (question_number, letter_chosen). If the line
has "wrong" or "didnt know" we flag it as a wrong answer. We output a JSON
seed keyed by exam slug (matching data/index.json) → { qNumber: { chosen,
isWrong } }.

The website merges this into user "aryan"'s selections so his Stats page
reflects everything from this log.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

PDF = Path("/Users/aryank/Downloads/DECA IMCE ICDC Test Prep  (2).pdf")
OUT = Path("/Users/aryank/DECA Study Website/data/seed-aryan.json")


def extract_lines(path: Path) -> list[str]:
    doc = pymupdf.open(path)
    text = "\n".join(p.get_text() for p in doc)
    doc.close()
    # Normalize the invisible zero-width joiners that appear after "N."
    text = text.replace("\u200b", "")
    return [ln.rstrip() for ln in text.splitlines()]


HEADER_RE = re.compile(
    r"^\s*sample\s*(?:exam)?\s*#?\s*(\d{1,2})\b(?!\s*/\s*\d)",
    flags=re.IGNORECASE,
)
# Matches "NN. X" possibly followed by "wrong"/"didnt know"/freeform notes
ANS_RE = re.compile(
    r"^\s*(\d{1,3})\.\s*([A-Da-d])\s*(.*)$"
)
WRONG_RE = re.compile(r"\b(wrong|didnt\s+know|didn'?t\s+know|incorrect)\b", flags=re.IGNORECASE)


def parse(lines: list[str]) -> dict:
    current_exam: int | None = None
    seeds: dict[int, dict[int, dict]] = {}  # exam_num -> { qnum: {chosen, isWrong, note} }
    for ln in lines:
        # Header? "Sample 1 87/100", "Sample Exam 1 3/1/2026", etc.
        mh = HEADER_RE.match(ln)
        if mh:
            n = int(mh.group(1))
            if 1 <= n <= 30:
                # Avoid treating answer lines starting with number as headers.
                # HEADER_RE already excludes that (requires word "sample").
                current_exam = n
                seeds.setdefault(current_exam, {})
                continue

        if current_exam is None:
            continue

        ma = ANS_RE.match(ln)
        if not ma:
            continue
        qnum = int(ma.group(1))
        letter = ma.group(2).upper()
        tail = ma.group(3) or ""
        is_wrong = bool(WRONG_RE.search(tail))
        # Sanity: ignore when qnum out of plausible range for an exam (1..100)
        if not (1 <= qnum <= 110):
            continue
        entry = seeds[current_exam].get(qnum, {})
        # If we've already recorded this answer, prefer the wrong-marked version.
        if entry and not is_wrong:
            continue
        seeds[current_exam][qnum] = {
            "chosen": letter,
            "wrong": is_wrong,
            "note": tail.strip() if is_wrong else "",
        }
    return seeds


def main() -> None:
    lines = extract_lines(PDF)
    seeds = parse(lines)
    # Map to slugs the site uses.
    out = {}
    summary = []
    for exam_num, qs in sorted(seeds.items()):
        slug = f"sample-exam-{exam_num}"
        out[slug] = qs
        wrong_count = sum(1 for q in qs.values() if q["wrong"])
        answered = len(qs)
        summary.append((slug, answered, wrong_count))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))

    total_wrong = sum(w for _, _, w in summary)
    total_ans = sum(a for _, a, _ in summary)
    print(f"Wrote {OUT} — {total_ans} answers recorded, {total_wrong} wrong")
    for slug, a, w in summary:
        print(f"  {slug}: {a} answered, {w} wrong")


if __name__ == "__main__":
    main()
