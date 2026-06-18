#!/usr/bin/env python3
"""Generic DECA cluster exam PDF parser (MBAResearch format).

Usage:
  python3 scripts/parse_cluster_exams.py <cluster_id> <file_prefix> <title_prefix> [src_dir]

Examples:
  python3 scripts/parse_cluster_exams.py ht  HT  "H&T"   ~/Downloads
  python3 scripts/parse_cluster_exams.py ep  EP  "Entr." ~/Downloads
  python3 scripts/parse_cluster_exams.py fin FI  "Finance"
  python3 scripts/parse_cluster_exams.py pfl PFL "PFL"
  python3 scripts/parse_cluster_exams.py mkt MK  "Marketing"

Reads "<PREFIX> <YEAR>.pdf" (case-insensitive) for 2017-2026 from src_dir and
writes data/<cluster_id>/<cluster_id>-<year>.json + index.json. Prints the
PI-prefix frequency (instructional-area weighting) at the end.
"""
from __future__ import annotations
import json, re, sys, os, glob
from collections import Counter
from pathlib import Path
import pymupdf

def extract_text(p):
    d = pymupdf.open(p); t = "\n".join(pg.get_text() for pg in d); d.close(); return t

def split_questions_key(text):
    for pat in [r"CLUSTER EXAM\s*[-—–]\s*KEY", r"CAREER CLUSTER EXAM\s*[-—–]\s*KEY",
                r"EXAM\s*[-—–]\s*KEY", r"EXAM\s*KEY"]:
        m = re.search(pat, text, re.I)
        if m: return text[:m.start()], text[m.start():]
    m = re.search(r"\bKEY\b", text)
    return (text[:m.start()], text[m.start():]) if m else (text, "")

def parse_questions(text):
    qs = {}
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1)); s = m.end()
        e = starts[i+1].start() if i+1 < len(starts) else len(text)
        b = text[s:e]
        op = []
        for L in "ABCD":
            om = re.search(r"(?m)^\s{0,6}"+L+r"\.\s", b)
            if om: op.append((L, om.start(), om.end()))
        if len(op) < 4: continue
        stem = re.sub(r"\s+", " ", b[:op[0][1]]).strip()
        if len(stem.split()) < 2: continue
        options = {}
        for idx, (L, _s, ts) in enumerate(op):
            ne = op[idx+1][1] if idx+1 < len(op) else len(b)
            options[L] = re.sub(r"\s+", " ", b[ts:ne]).strip()
        qs[num] = {"number": num, "question": stem, "options": options}
    return qs

def parse_key(text):
    e = {}
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s+([A-D])\s*$", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1)); letter = m.group(2)
        bs = m.end(); be = starts[i+1].start() if i+1 < len(starts) else len(text)
        body = text[bs:be]; expl, src = [], []
        for line in body.splitlines():
            (src if re.match(r"^\s*SOURCE\s*:", line, re.I) else expl).append(line)
        explanation = re.sub(r"\s+", " ", " ".join(l.strip() for l in expl if l.strip())).strip()
        explanation = re.sub(r"Test\s+\d+\s+[A-Z &]+EXAM[—\-– ]*KEY?\s+\d+", "", explanation, flags=re.I).strip()
        e[num] = {"answer": letter, "explanation": explanation, "sources": [s.strip() for s in src]}
    return e

def parse_exam(pdf):
    q_text, k_text = split_questions_key(extract_text(pdf))
    questions = parse_questions(q_text); key = parse_key(k_text) if k_text else {}
    merged = []
    for num in sorted(questions):
        q = questions[num]; k = key.get(num, {})
        merged.append({"number": num, "question": q["question"], "options": q["options"],
                       "answer": k.get("answer"), "explanation": k.get("explanation", ""),
                       "sources": k.get("sources", [])})
    return {"file": pdf.name, "question_count": len(merged),
            "answered_count": sum(1 for m in merged if m["answer"]), "questions": merged}

def main():
    cid, prefix, title_prefix = sys.argv[1], sys.argv[2], sys.argv[3]
    src = Path(os.path.expanduser(sys.argv[4])) if len(sys.argv) > 4 else Path(os.path.expanduser("~/Downloads"))
    out = Path("/Users/aryank/DECA Study Website/data") / cid
    out.mkdir(parents=True, exist_ok=True)
    index = []; pic = Counter()
    for year in range(2017, 2027):
        matches = [f for f in glob.glob(str(src/"*.pdf"))
                   if re.match(prefix + r"\s+" + str(year) + r"\.pdf$", os.path.basename(f), re.I)]
        if not matches:
            continue
        pdf = Path(matches[0]); data = parse_exam(pdf); slug = f"{cid}-{year}"
        (out/f"{slug}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        for q in data["questions"]:
            for s in q.get("sources", []):
                mm = re.search(r"SOURCE:\s*([A-Z]{2,3}):", s)
                if mm: pic[mm.group(1)] += 1
        index.append({"slug": slug, "title": f"{title_prefix} {year} ICDC", "file": pdf.name,
                      "question_count": data["question_count"], "answered_count": data["answered_count"],
                      "available": True, "json": f"data/{cid}/{slug}.json"})
        print(f"[ok] {pdf.name}: {data['question_count']} q, {data['answered_count']} ans -> {slug}.json")
    index.sort(key=lambda it: it["slug"])
    (out/"index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(index)} exams to {out}")
    print("PI weighting:", ", ".join(f"{p}:{n}" for p, n in pic.most_common()))

if __name__ == "__main__":
    main()
