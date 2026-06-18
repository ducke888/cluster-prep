#!/usr/bin/env python3
"""Parse DECA Business Management & Administration (BMA) Cluster exam PDFs into JSON.

Same MBAResearch format as the Marketing cluster exams (see parse_exams.py),
so the question/key/source parsing is identical — only the KEY header pattern
and the output location differ.

Input:  /Users/aryank/Downloads/BM 20YY.pdf  (2017..2026)
Output: data/bma/bma-20YY.json  +  data/bma/index.json
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import pymupdf

SRC = Path("/Users/aryank/Downloads")
OUT_DIR = Path("/Users/aryank/DECA Study Website/data/bma")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_text(pdf_path: Path) -> str:
    doc = pymupdf.open(pdf_path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def split_questions_key(text: str) -> tuple[str, str]:
    patterns = [
        r"BUSINESS MANAGEMENT AND ADMINISTRATION CLUSTER EXAM\s*[-—–]\s*KEY",
        r"BUSINESS MANAGEMENT AND ADMINISTRATION CLUSTER EXAM\s*KEY",
        r"ADMINISTRATION CLUSTER EXAM\s*[-—–]\s*KEY",
        r"CLUSTER EXAM\s*[-—–]\s*KEY",
        r"EXAM\s*[-—–]\s*KEY",
        r"EXAM\s*KEY",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            return text[: m.start()], text[m.start():]
    m = re.search(r"\bKEY\b", text)
    if m:
        return text[: m.start()], text[m.start():]
    return text, ""


def parse_questions(text: str) -> dict[int, dict]:
    questions: dict[int, dict] = {}
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1))
        start = m.end()
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        block = text[start:end]
        opt_positions = []
        for letter in "ABCD":
            om = re.search(r"(?m)^\s{0,6}" + letter + r"\.\s", block)
            if om:
                opt_positions.append((letter, om.start(), om.end()))
        if len(opt_positions) < 4:
            continue
        stem = re.sub(r"\s+", " ", block[: opt_positions[0][1]]).strip()
        if len(stem.split()) < 2:
            continue
        options = {}
        for idx, (letter, _s, text_start) in enumerate(opt_positions):
            next_start = opt_positions[idx + 1][1] if idx + 1 < len(opt_positions) else len(block)
            options[letter] = re.sub(r"\s+", " ", block[text_start:next_start]).strip()
        questions[num] = {"number": num, "question": stem, "options": options}
    return questions


def parse_key(text: str) -> dict[int, dict]:
    entries: dict[int, dict] = {}
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s+([A-D])\s*$", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1))
        letter = m.group(2)
        body_start = m.end()
        body_end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        body = text[body_start:body_end]
        expl_lines, source_lines = [], []
        for line in body.splitlines():
            if re.match(r"^\s*SOURCE\s*:", line, flags=re.IGNORECASE):
                source_lines.append(line.strip())
            else:
                expl_lines.append(line)
        explanation = re.sub(r"\s+", " ", " ".join(l.strip() for l in expl_lines if l.strip())).strip()
        explanation = re.sub(
            r"Test\s+\d+\s+BUSINESS MANAGEMENT[A-Z ]+EXAM[—\-– ]*KEY?\s+\d+",
            "", explanation, flags=re.IGNORECASE,
        ).strip()
        entries[num] = {"answer": letter, "explanation": explanation, "sources": source_lines}
    return entries


def parse_exam(pdf_path: Path) -> dict:
    text = extract_text(pdf_path)
    q_text, k_text = split_questions_key(text)
    questions = parse_questions(q_text)
    key = parse_key(k_text) if k_text else {}
    merged = []
    for num in sorted(questions.keys()):
        q = questions[num]
        k = key.get(num, {})
        merged.append({
            "number": num,
            "question": q["question"],
            "options": q["options"],
            "answer": k.get("answer"),
            "explanation": k.get("explanation", ""),
            "sources": k.get("sources", []),
        })
    return {
        "file": pdf_path.name,
        "question_count": len(merged),
        "answered_count": sum(1 for m in merged if m["answer"]),
        "questions": merged,
    }


def main() -> None:
    index = []
    prefix_counts: Counter = Counter()
    for year in range(2017, 2027):
        pdf = SRC / f"BM {year}.pdf"
        if not pdf.exists():
            print(f"[miss] {pdf.name}", file=sys.stderr)
            continue
        data = parse_exam(pdf)
        slug = f"bma-{year}"
        (OUT_DIR / f"{slug}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        for q in data["questions"]:
            for s in q.get("sources", []):
                m = re.search(r"SOURCE:\s*([A-Z]{2,3}):", s)
                if m:
                    prefix_counts[m.group(1)] += 1
        index.append({
            "slug": slug,
            "title": f"BMA {year} ICDC",
            "file": pdf.name,
            "question_count": data["question_count"],
            "answered_count": data["answered_count"],
            "available": True,
            "json": f"data/bma/{slug}.json",
        })
        print(f"[ok] {pdf.name}: {data['question_count']} q, {data['answered_count']} answers -> {slug}.json")

    index.sort(key=lambda it: it["slug"])
    (OUT_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(index)} BMA exams to {OUT_DIR}")
    print("\nPI-prefix frequency across all BMA exams (instructional-area weighting):")
    for pfx, n in prefix_counts.most_common():
        print(f"  {pfx}: {n}")


if __name__ == "__main__":
    main()
