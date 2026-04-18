#!/usr/bin/env python3
"""Parse Aryan's two PDF-extracted text files into seed-aryan.json.

Reads:
  /tmp/DECA IMCE Question Log.txt
  /tmp/DECA IMCE ICDC Test Prep  (3).txt

Writes:
  data/seed-aryan.json  (schema: { "<slug>": { "<qnum>": {chosen, wrong, note?} } })

Does NOT carry over PI codes or notes beyond minimal empty strings — grading comes
from each exam JSON's answer key.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LOG_TXT = Path("/tmp/DECA IMCE Question Log.txt")
PREP_TXT = Path("/tmp/DECA IMCE ICDC Test Prep  (3).txt")
OUT = DATA / "seed-aryan.json"

# Regex: question number + letter, e.g. "1.  D" or "100. B"
# We lowercase the file first to be safe, but keep case-insensitive match.
Q_RE = re.compile(r"(?<!\d)(\d{1,3})\.\s*([A-Da-d])\b")


def load_exam(slug: str) -> dict:
    p = DATA / f"{slug}.json"
    with open(p) as f:
        e = json.load(f)
    # map qnum -> answer letter
    answers = {}
    for q in e["questions"]:
        ans = q.get("answer")
        num = q.get("num", q.get("number"))
        if ans and num is not None:
            answers[int(num)] = ans.upper()
    return answers


def extract_picks(text: str) -> list[tuple[int, str, int]]:
    """Return list of (qnum, letter, position)."""
    out = []
    for m in Q_RE.finditer(text):
        qnum = int(m.group(1))
        letter = m.group(2).upper()
        if 1 <= qnum <= 100:
            out.append((qnum, letter, m.start()))
    return out


def pick_section(text: str, start: int, end: int) -> dict[int, str]:
    """Extract question->pick dict from a text slice. If qnum repeats, keep first."""
    seg = text[start:end]
    picks = {}
    for m in Q_RE.finditer(seg):
        q = int(m.group(1))
        l = m.group(2).upper()
        if 1 <= q <= 100 and q not in picks:
            picks[q] = l
    return picks


def find_markers(text: str, patterns: list[str]) -> list[tuple[int, str]]:
    """Find all marker positions (case-insensitive substring)."""
    lower = text.lower()
    hits = []
    for pat in patterns:
        p = pat.lower()
        i = 0
        while True:
            j = lower.find(p, i)
            if j < 0:
                break
            hits.append((j, pat))
            i = j + 1
    hits.sort()
    return hits


def grade(picks: dict[int, str], key: dict[int, str]) -> tuple[int, int]:
    correct = 0
    total = 0
    for q, pick in picks.items():
        if q in key:
            total += 1
            if pick == key[q]:
                correct += 1
    return correct, total


def build_entries(picks: dict[int, str], key: dict[int, str]) -> dict:
    out = {}
    for q, pick in sorted(picks.items()):
        if q in key:
            wrong = pick != key[q]
        else:
            wrong = False  # no answer key available — treat as attempted, not gradeable
        out[str(q)] = {"chosen": pick, "wrong": wrong, "note": ""}
    return out


def main():
    log_text = LOG_TXT.read_text()
    prep_text = PREP_TXT.read_text()

    seed = {}
    stats = []

    # ----- QUESTION LOG -----
    # Segment manually based on discovered markers.
    # Define (slug, start_marker, end_marker) tuples using substring search.
    # We use lowered search.
    lt = log_text

    def slice_between(start_needle: str, end_needle: str, from_pos: int = 0) -> tuple[str, int, int]:
        lo = lt.lower()
        s = lo.find(start_needle.lower(), from_pos)
        if s < 0:
            raise RuntimeError(f"start not found: {start_needle}")
        e = lo.find(end_needle.lower(), s + len(start_needle))
        if e < 0:
            e = len(lt)
        return lt[s:e], s, e

    # state-1: Day 1 through Day 4, ends at "State Marketing Exam #4"
    seg, s, e = slice_between("Day  1:", "State  Marketing  Exam  #4")
    state1_picks = pick_section(lt, s, e)

    # state-4: from "State Marketing Exam #4" up to "Day 7"
    seg, s, e = slice_between("State  Marketing  Exam  #4", "Day  7")
    state4_picks = pick_section(lt, s, e)

    # unlabeled day 7: "Day 7" to "Day 8"
    seg, s, e = slice_between("Day  7", "Day  8")
    day7_picks = pick_section(lt, s, e)

    # unlabeled day 8: "Day 8" to "State Test #5"
    seg, s, e = slice_between("Day  8", "State  Test  #5")
    day8_picks = pick_section(lt, s, e)

    # state-5: "State Test #5" Day 9+10 up to "2018 icdc"
    seg, s, e = slice_between("State  Test  #5", "2018  icdc")
    state5_picks = pick_section(lt, s, e)

    # icdc-2018: "2018 icdc" to "2017 icdc"
    seg, s, e = slice_between("2018  icdc", "2017  icdc")
    icdc18_picks = pick_section(lt, s, e)

    # icdc-2017: "2017 icdc" to "2016 icdc"
    seg, s, e = slice_between("2017  icdc", "2016  icdc")
    icdc17_picks = pick_section(lt, s, e)

    # icdc-2016: "2016 icdc" to "2015 icdc"
    seg, s, e = slice_between("2016  icdc", "2015  icdc")
    icdc16_picks = pick_section(lt, s, e)

    # icdc-2015: "2015 icdc" to "2014 icdc"
    seg, s, e = slice_between("2015  icdc", "2014  icdc")
    icdc15_picks = pick_section(lt, s, e)

    # icdc-2014: "2014 icdc" to "Test 1309" (sample-26)
    seg, s, e = slice_between("2014  icdc", "Test  1309")
    icdc14_picks = pick_section(lt, s, e)

    # sample-26: "Test 1309" to "Vocab:"
    seg, s, e = slice_between("Test  1309", "Vocab:")
    sample26_picks = pick_section(lt, s, e)

    # ambiguous day 7/8: test against state-2 vs state-3
    s2 = load_exam("state-2")
    s3 = load_exam("state-3")
    d7_vs_s2 = grade(day7_picks, s2)
    d7_vs_s3 = grade(day7_picks, s3)
    d8_vs_s2 = grade(day8_picks, s2)
    d8_vs_s3 = grade(day8_picks, s3)

    # pick the better match; prefer non-overlapping assignment
    # Compute rates
    def rate(t):
        c, n = t
        return (c / n) if n else 0

    # Choose the best pairing. Try both assignments:
    a1 = rate(d7_vs_s2) + rate(d8_vs_s3)
    a2 = rate(d7_vs_s3) + rate(d8_vs_s2)
    # If state-2/state-3 have no answer keys (null), both rates are 0.
    # Fall back to positional assignment: Day 7 -> state-2, Day 8 -> state-3.
    if a1 == 0 and a2 == 0:
        print("  (no answer keys in state-2/state-3 — positional fallback)")
    if a1 >= a2:
        day7_exam, day8_exam = "state-2", "state-3"
        day7_key, day8_key = s2, s3
        day7_match = d7_vs_s2
        day8_match = d8_vs_s3
    else:
        day7_exam, day8_exam = "state-3", "state-2"
        day7_key, day8_key = s3, s2
        day7_match = d7_vs_s3
        day8_match = d8_vs_s2

    print(f"Day7 vs state-2: {d7_vs_s2}, vs state-3: {d7_vs_s3}")
    print(f"Day8 vs state-2: {d8_vs_s2}, vs state-3: {d8_vs_s3}")
    print(f"  -> Day 7 = {day7_exam} ({day7_match[0]}/{day7_match[1]}), Day 8 = {day8_exam} ({day8_match[0]}/{day8_match[1]})")

    # Merge day7/day8 picks into state-2/state-3 (only 25 Qs each, only Q1-25)
    # Question Log only covers the first 25 of each; rest remain unanswered.
    log_assignments = [
        ("state-1", state1_picks),
        ("state-4", state4_picks),
        (day7_exam, day7_picks),
        (day8_exam, day8_picks),
        ("state-5", state5_picks),
        ("icdc-2018", icdc18_picks),
        ("icdc-2017", icdc17_picks),
        ("icdc-2016", icdc16_picks),
        ("icdc-2015", icdc15_picks),
        ("icdc-2014", icdc14_picks),
        ("sample-exam-26", sample26_picks),
    ]

    for slug, picks in log_assignments:
        key = load_exam(slug)
        entries = build_entries(picks, key)
        if slug in seed:
            seed[slug].update(entries)
        else:
            seed[slug] = entries
        c, n = grade(picks, key)
        stats.append((slug, n, c))

    # ----- ICDC TEST PREP (samples 1-9) -----
    pt = prep_text

    # Segment by "Sample  N  87/100" header lines. We locate markers.
    # Use the score-header pattern: "Sample  1  87/100", "Sample  2  86/100", etc.
    # Then the following section runs until the next "Sample  M  X/100" header.
    score_re = re.compile(r"Sample\s+(\d)\s+(\d{1,3})/100")
    headers = []
    for m in score_re.finditer(pt):
        headers.append((int(m.group(1)), int(m.group(2)), m.start(), m.end()))

    # Filter to first occurrence of each sample number (the header at top)
    seen = {}
    for num, sc, s_, e_ in headers:
        if num not in seen:
            seen[num] = (sc, s_, e_)

    ordered = sorted(seen.items())  # [(1, (sc, s, e)), (2, ...), ...]
    for i, (num, (sc, s_, e_)) in enumerate(ordered):
        slug = f"sample-exam-{num}"
        start = e_
        if i + 1 < len(ordered):
            end = ordered[i + 1][1][1]
        else:
            end = len(pt)
        picks = pick_section(pt, start, end)
        key = load_exam(slug)
        entries = build_entries(picks, key)
        seed[slug] = entries
        c, n = grade(picks, key)
        stats.append((slug, n, c))

    # ----- write -----
    with open(OUT, "w") as f:
        json.dump(seed, f, indent=2)

    # ----- report -----
    print()
    print(f"Wrote {OUT}")
    print()
    total_q = 0
    total_c = 0
    for slug, n, c in stats:
        print(f"  {slug:20s}  {n:3d} questions, {c:3d} correct  ({(100*c/n) if n else 0:.1f}%)")
        total_q += n
        total_c += c
    print(f"  {'TOTAL':20s}  {total_q:3d} questions, {total_c:3d} correct")


if __name__ == "__main__":
    main()
