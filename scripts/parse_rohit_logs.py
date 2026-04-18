#!/usr/bin/env python3
"""Parse all of Rohit's test logs into a single rohit seed.

Each log is plain text with one answer per question line, in test order.
Wrong answers are marked with an `X` adjacent to the letter (prefix, suffix,
or separated by a dash). Some lines also have free-form notes after.

Layouts seen:
  - Unnumbered: just letters, one per line, starting from question 1.
  - Numbered:   "1. D" or "1.D".
  - Occasional junk lines (headers, blank lines, explanations).

We produce a seed keyed by exam slug (matching data/index.json):
    { slug: { qNumber: { chosen, wrong, note } } }

Then reconcile every "chosen" letter against the actual answer key in
data/<slug>.json — if chosen != answer but Rohit did NOT mark X, we still
record it as wrong (he missed it).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

DATA_DIR = Path("/Users/aryank/DECA Study Website/data")
DL = Path("/Users/aryank/Downloads")
OUT = DATA_DIR / "seed-rohit.json"

# (log file, exam slug, optional explicit "is numbered?" override)
LOGS = [
    ("Marketing Test state 1.txt",        "state-1",       False),
    ("Marketing test 2014.txt",           "icdc-2014",     False),
    ("Marketing icdc 20180.txt",          "icdc-2018",     True),
    ("stae marktietng test 5 i think.txt","state-5",       True),
    ("sample Exam 6.txt",                 "sample-exam-6", False),
    ("Sample 7.txt",                      "sample-exam-7", False),
    ("SAMPLE 8.txt",                      "sample-exam-8", False),
    ("Copy of sample m16.txt",            "sample-16",     False),
    # "Sample Test 1.txt" is junk (all '3's) — excluded.
]

# Chat-pasted blocks are handled separately as strings at the bottom.


# Regex that captures: optional number, then a letter A-D, with optional X marker.
# Groups: (num, letter, wrong_flag)
LINE_RE = re.compile(
    r"""^\s*
        (?:(\d{1,3})\s*[\.\)]\s*)?          # optional "12."
        [-–—]?                                # stray dash
        \s*
        (?:
            ([Xx])\s*[-–—]?\s*([A-Da-d])\b   # X-letter  (g2=X, g3=letter)
          |
            ([A-Da-d])\s*[-–—]?\s*([Xx])     # letter-X   (g4=letter, g5=X)
          |
            ([A-Da-d])(?=$|[\s\W])           # letter alone (g6)
          |
            ([A-Da-d])(?=[A-Z]{2})           # letter + uppercase-code (g7)
        )
        (.*)$                                 # rest of line
    """,
    re.VERBOSE,
)


def parse_log(path: Path, numbered: bool) -> dict[int, dict]:
    """Return { qnum: { chosen, wrong, note } }."""
    out: dict[int, dict] = {}
    seen = 0  # counter for unnumbered logs
    with path.open(encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip()
            if not line.strip():
                continue
            # Try LINE_RE first. If it matches and the letter is A-D, treat it as an answer.
            m = LINE_RE.match(line)
            # Heuristic header-skip: if line looks like a section title (starts with a
            # common header word) AND LINE_RE didn't capture a real letter at the start,
            # drop it.
            if m is None:
                continue
            # A line may start with a letter that's actually the first char of an English
            # word like "Sample", "Marketing", etc. Filter those out.
            starts_with_header_word = re.match(
                r"^\s*(sample|marketing|test|questions?|practice|icdc|deca|exam|day)\b",
                line,
                flags=re.IGNORECASE,
            )
            if starts_with_header_word:
                continue
            num_g = m.group(1)
            x_prefix = m.group(2)
            letter_after_x = m.group(3)      # path 1: X-letter
            letter_before_x = m.group(4)     # path 2: letter-X
            x_suffix = m.group(5)            # path 2: X after letter
            letter_alone = m.group(6)        # path 3: letter alone
            letter_w_code = m.group(7)       # path 4: letter followed by code prefix
            tail = (m.group(8) or "").strip()

            letter = (letter_after_x or letter_before_x or letter_alone or letter_w_code or "").upper()
            if letter not in "ABCD":
                continue
            # Additional wrong-marker: line like "A-xnigga..." where the "-x" directly
            # follows the letter and is glued to the next word.
            sticky_dash_x = bool(re.match(r"^\s*[A-Da-d]\s*[-–—]\s*[xX](?=\w)", line))
            wrong = (
                bool(x_prefix or x_suffix)
                or sticky_dash_x
                or bool(re.search(
                    r"\bwrong\b|\bdidnt\s+know\b|didn'?t\s+know|\bincorrect\b",
                    tail,
                    flags=re.IGNORECASE,
                ))
            )

            if numbered:
                if not num_g:
                    continue
                qnum = int(num_g)
            else:
                # If a number IS present on the line, trust it; otherwise increment counter.
                if num_g:
                    qnum = int(num_g)
                else:
                    seen += 1
                    qnum = seen
            if not (1 <= qnum <= 110):
                continue
            # Don't overwrite once set (first occurrence wins for unnumbered).
            if qnum in out and not wrong:
                continue
            out[qnum] = {
                "chosen": letter,
                "wrong": wrong,
                "note": tail if wrong else "",
            }
    return out


# -------- Chat-pasted logs --------

# "ample 9" block – the user pasted it with 100 lines but some messy formatting.
# Letters in order; X marker anywhere in token = wrong.
SAMPLE_9_TEXT = """
C
B
C
D
CX
B
D
C
B
D
D
XC
CX
D
DX
D
C
XC
DX
C
A
B
C
B
A
D
XB
D
C
D
A
XD
DX
BX
B
B
C
XB
D
A
B
XD
A
BX
A
A
D
A
A
A
C
D
C
XB
B
B
D
XB
B
C
C
B
XA
A
DX
D
A
XD
C
B
B
A
A
B
A
B
C
B
XA
C
C
A
BX
CX
C
C
C
A
XA
C
D
C
XA
A
D
B
C
AX
AX
BX
"""

# "deca test icdc 2016" block - 100 letter lines (with notes). We'll re-use the same parser.
ICDC_2016_TEXT = """
C
AX
DX
B
C
A
A
C
A
B
B
A
D
DX
B
B
C
D
B
C
B
C
CX
AX
C
C
D
B
A
DX
D
BX
C
D
A
AX
D
D
C
D
B
B
C
B
B
D
B
C
D
A
C
D
A
C
B
BX
B
A
A
A
B
AX
C
D
A
AX
A
C
C
A
C
DX
D
C
B
AX
C
B
D
B
D
C
B
A
D
B
A
A
A
D
A
C
B
A
B
C
A
D
A
C
"""


def parse_inline(text: str) -> dict[int, dict]:
    out: dict[int, dict] = {}
    n = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        letter = (m.group(3) or m.group(4) or m.group(6) or m.group(7) or "").upper()
        wrong = bool(m.group(2) or m.group(5))
        if letter not in "ABCD":
            continue
        n += 1
        out[n] = {"chosen": letter, "wrong": wrong, "note": ""}
    return out


def main() -> None:
    all_seeds: dict[str, dict[int, dict]] = {}
    for fname, slug, numbered in LOGS:
        p = DL / fname
        if not p.exists():
            print(f"[missing] {fname}")
            continue
        parsed = parse_log(p, numbered)
        all_seeds[slug] = parsed
        w = sum(1 for q in parsed.values() if q["wrong"])
        print(f"[log] {fname} -> {slug}: {len(parsed)} answered, {w} marked wrong")

    # Chat pasted blocks
    s9 = parse_inline(SAMPLE_9_TEXT)
    all_seeds["sample-exam-9"] = s9
    print(f"[chat] Sample 9 -> sample-exam-9: {len(s9)} answered, {sum(1 for q in s9.values() if q['wrong'])} marked wrong")

    icdc16 = parse_inline(ICDC_2016_TEXT)
    all_seeds["icdc-2016"] = icdc16
    print(f"[chat] ICDC 2016 -> icdc-2016: {len(icdc16)} answered, {sum(1 for q in icdc16.values() if q['wrong'])} marked wrong")

    # Reconcile against the actual answer keys.
    for slug, qs in all_seeds.items():
        exam_file = DATA_DIR / f"{slug}.json"
        if not exam_file.exists():
            print(f"[no-exam] {slug}")
            continue
        exam = json.loads(exam_file.read_text())
        key = {q["number"]: q.get("answer") for q in exam["questions"]}
        # Mark wrong by comparison too.
        correct_count = 0
        rec_wrong = 0
        for num, info in qs.items():
            right = key.get(num)
            if right and info.get("chosen"):
                if info["chosen"] == right:
                    correct_count += 1
                else:
                    if not info["wrong"]:
                        info["wrong"] = True
                        info["note"] = (info.get("note") or "") + " [auto-detected wrong]"
                    rec_wrong += 1
        print(f"[reconcile] {slug}: answered={len(qs)} correct={correct_count} auto-wrongs-added={rec_wrong}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_seeds, ensure_ascii=False, indent=2))
    print(f"\nWrote seed -> {OUT}")

    # Summary: totals
    total_ans = total_wrong = 0
    for slug, qs in all_seeds.items():
        total_ans += len(qs)
        total_wrong += sum(1 for q in qs.values() if q["wrong"])
    print(f"\nTotal: {total_ans} answers, {total_wrong} wrong across {len(all_seeds)} exams")


if __name__ == "__main__":
    main()
