#!/usr/bin/env python3
"""Parse the additional exam PDFs (State #1-5, ICDC 2010-2018) and emit
per-exam JSONs next to the sample-exam-*.json files.

Uses the same parser as scripts/parse_exams.py but configurable source/slug.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

DATA_DIR = Path("/Users/aryank/DECA Study Website/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# -- re-use parser logic locally (copy to avoid import dance) --


def extract_text(pdf_path: Path) -> str:
    doc = pymupdf.open(pdf_path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def split_questions_key(text: str):
    patterns = [
        r"MARKETING CLUSTER EXAM\s*[-—–]\s*KEY",
        r"MARKETING CLUSTER EXAM\s*KEY",
        r"MARKETING CAREER CLUSTER EXAM\s*[-—–]\s*KEY",
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


def parse_questions(text: str):
    questions = {}
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
        stem = block[: opt_positions[0][1]].strip()
        stem = re.sub(r"\s+", " ", stem)
        options = {}
        for idx, (letter, _s, text_start) in enumerate(opt_positions):
            next_start = opt_positions[idx + 1][1] if idx + 1 < len(opt_positions) else len(block)
            opt_text = block[text_start:next_start].strip()
            opt_text = re.sub(r"\s+", " ", opt_text)
            options[letter] = opt_text
        if not stem or len(stem.split()) < 2:
            continue
        questions[num] = {
            "number": num,
            "question": stem,
            "options": options,
        }
    return questions


def parse_key(text: str):
    entries = {}
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s+([A-D])\s*$", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1))
        letter = m.group(2)
        body_start = m.end()
        body_end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        body = text[body_start:body_end]
        expl_lines = []
        source_lines = []
        for line in body.splitlines():
            if re.match(r"^\s*SOURCE\s*:", line, flags=re.IGNORECASE):
                source_lines.append(line.strip())
            else:
                expl_lines.append(line)
        explanation = re.sub(r"\s+", " ", " ".join(expl_lines)).strip()
        explanation = re.sub(
            r"Test\s+\d+\s+MARKETING [A-Z ]+EXAM[—\-– ]*KEY?\s+\d+",
            "",
            explanation,
            flags=re.IGNORECASE,
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


# (pdf_path, slug, display_title)
SOURCES = [
    # State
    ("/Users/aryank/Downloads/Marketing Cluster/Marketing Exam - State #1.pdf", "state-1", "State Exam #1"),
    ("/Users/aryank/Downloads/Marketing Cluster/Marketing Exam - State #2.pdf", "state-2", "State Exam #2"),
    ("/Users/aryank/Downloads/Marketing Cluster/Marketing Exam - State #3.pdf", "state-3", "State Exam #3"),
    ("/Users/aryank/Downloads/Marketing Cluster/Marketing Exam - State #4.pdf", "state-4", "State Exam #4"),
    ("/Users/aryank/Downloads/Marketing Cluster/Marketing Exam - State #5.pdf", "state-5", "State Exam #5"),
    # ICDC single-cluster years
    ("/Users/aryank/Downloads/ICDC Written Exams/2010/2010 HS ICDC Test and Key (Marketing Cluster).pdf", "icdc-2010", "ICDC 2010 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2011/2011 HS ICDC Test and Key (Marketing Cluster).pdf", "icdc-2011", "ICDC 2011 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2012/2012 HS ICDC Test and Key (Marketing Cluster).pdf", "icdc-2012", "ICDC 2012 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2013/2013 HS ICDC Test and Key (Marketing Cluster).pdf", "icdc-2013", "ICDC 2013 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2014/2014 Marketing.pdf", "icdc-2014", "ICDC 2014 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2015/2015 HS ICDC Test and Key (Marketing).pdf", "icdc-2015", "ICDC 2015 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2016/2016 HS ICDC Test and Key (Marketing).pdf", "icdc-2016", "ICDC 2016 (Marketing)"),
    # 2017 & 2018 are multi-cluster combined files — handled separately below.
]

MULTI_CLUSTER = [
    ("/Users/aryank/Downloads/ICDC Written Exams/2017/2017 HS ICDC Tests and Keys (all clusters).pdf", "icdc-2017", "ICDC 2017 (Marketing)"),
    ("/Users/aryank/Downloads/ICDC Written Exams/2018/2018 HS ICDC Tests and Keys (all clusters).pdf", "icdc-2018", "ICDC 2018 (Marketing)"),
]


def parse_single(pdf_path_str: str, slug: str, title: str):
    pdf_path = Path(pdf_path_str)
    if not pdf_path.exists():
        print(f"[missing] {pdf_path}", file=sys.stderr)
        return None
    data = parse_exam(pdf_path)
    data["title"] = title
    out = DATA_DIR / f"{slug}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[ok] {slug}: {data['question_count']} Qs ({data['answered_count']} with key) -> {out.name}")
    return {
        "slug": slug,
        "title": title,
        "file": pdf_path.name,
        "question_count": data["question_count"],
        "answered_count": data["answered_count"],
        "available": data["question_count"] > 0,
        "json": f"data/{slug}.json",
    }


def parse_multi_cluster(pdf_path_str: str, slug: str, title: str):
    """Extract only the Marketing Cluster section from combined ICDC PDFs."""
    pdf_path = Path(pdf_path_str)
    if not pdf_path.exists():
        print(f"[missing] {pdf_path}", file=sys.stderr)
        return None
    doc = pymupdf.open(pdf_path)
    page_texts = [p.get_text() for p in doc]
    doc.close()

    # Find the page range that contains the Marketing Cluster Exam (and its key).
    # We gather question-pages starting from the first one that says "MARKETING CLUSTER EXAM"
    # through the end of the key section for Marketing.
    header_re = re.compile(r"MARKETING\s+CLUSTER\s+EXAM", re.IGNORECASE)
    other_cluster_re = re.compile(
        r"(?:BUSINESS MANAGEMENT|BUSINESS ADMINISTRATION CORE|FINANCE|HOSPITALITY"
        r"|PRINCIPLES|ENTREPRENEURSHIP|PERSONAL FINANCIAL)"
        r".*EXAM",
        re.IGNORECASE,
    )
    start = None
    for i, t in enumerate(page_texts):
        if header_re.search(t):
            start = i
            break
    if start is None:
        print(f"[no-marketing] {pdf_path}", file=sys.stderr)
        return None
    end = len(page_texts)
    for i in range(start + 1, len(page_texts)):
        if other_cluster_re.search(page_texts[i]) and not header_re.search(page_texts[i]):
            end = i
            break
    section_text = "\n".join(page_texts[start:end])
    q_text, k_text = split_questions_key(section_text)
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
    data = {
        "file": pdf_path.name,
        "title": title,
        "question_count": len(merged),
        "answered_count": sum(1 for m in merged if m["answer"]),
        "questions": merged,
    }
    out = DATA_DIR / f"{slug}.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"[ok] {slug}: {data['question_count']} Qs ({data['answered_count']} with key) -> {out.name}")
    return {
        "slug": slug,
        "title": title,
        "file": pdf_path.name,
        "question_count": data["question_count"],
        "answered_count": data["answered_count"],
        "available": data["question_count"] > 0,
        "json": f"data/{slug}.json",
    }


def main():
    entries = []
    for src, slug, title in SOURCES:
        e = parse_single(src, slug, title)
        if e:
            entries.append(e)
    for src, slug, title in MULTI_CLUSTER:
        e = parse_multi_cluster(src, slug, title)
        if e:
            entries.append(e)
    # Merge into existing index.json.
    idx_path = DATA_DIR / "index.json"
    try:
        existing = json.loads(idx_path.read_text())
    except Exception:
        existing = []
    have = {e["slug"] for e in existing}
    for e in entries:
        if e["slug"] not in have:
            existing.append(e)

    # Sort: sample-exam-*, then state-*, then icdc-*.
    def sort_key(e):
        slug = e["slug"]
        if slug.startswith("sample-exam-"):
            return (0, int(re.search(r"\d+", slug).group()))
        if slug == "sample-16":
            return (0, 16)
        if slug.startswith("state-"):
            return (1, int(slug.split("-")[1]))
        if slug.startswith("icdc-"):
            return (2, int(slug.split("-")[1]))
        return (9, slug)

    existing.sort(key=sort_key)
    idx_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    print(f"\nIndex updated: {len(existing)} total exams")


if __name__ == "__main__":
    main()
