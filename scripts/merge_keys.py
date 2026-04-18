#!/usr/bin/env python3
"""Merge standalone Key PDFs into their corresponding exam JSON files.

For exams 9, 15, 17, 23, the main PDF only has questions; a separate
"... Key.pdf" file contains the answers. We parse the key and inject
answers + explanations into the existing JSON.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

EXAMS_DIR = Path("/Users/aryank/Downloads/Sample Exams")
DATA_DIR = Path("/Users/aryank/DECA Study Website/data")

# Map: key-PDF filename -> exam slug it fills in.
KEY_PAIRS = {
    "Copy of Sample Exam 9 Key.pdf": "sample-exam-9",
    "Copy of Sample Exam 15 Key.pdf": "sample-exam-15",
    "Copy of Sample Exam 17 Key.pdf": "sample-exam-17",
    "Copy of Sample Exam 23 - Key.pdf": "sample-exam-23",
}


def extract_text(path: Path) -> str:
    doc = pymupdf.open(path)
    out = "\n".join(p.get_text() for p in doc)
    doc.close()
    return out


def parse_key(text: str) -> dict[int, dict]:
    entries: dict[int, dict] = {}
    starts = [
        m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s+([A-D])\s*$", text)
    ]
    for i, m in enumerate(starts):
        num = int(m.group(1))
        letter = m.group(2)
        body_start = m.end()
        body_end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        body = text[body_start:body_end]
        lines = body.splitlines()
        expl_lines = []
        source_lines = []
        for line in lines:
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
        entries[num] = {
            "answer": letter,
            "explanation": explanation,
            "sources": source_lines,
        }
    return entries


def main() -> None:
    for key_pdf_name, slug in KEY_PAIRS.items():
        key_path = EXAMS_DIR / key_pdf_name
        json_path = DATA_DIR / f"{slug}.json"
        if not key_path.exists():
            print(f"[missing-pdf] {key_pdf_name}", file=sys.stderr)
            continue
        if not json_path.exists():
            print(f"[missing-json] {json_path}", file=sys.stderr)
            continue
        text = extract_text(key_path)
        key = parse_key(text)
        data = json.loads(json_path.read_text())
        filled = 0
        for q in data["questions"]:
            k = key.get(q["number"])
            if k and not q.get("answer"):
                q["answer"] = k["answer"]
                q["explanation"] = k["explanation"]
                q["sources"] = k["sources"]
                filled += 1
        data["answered_count"] = sum(1 for m in data["questions"] if m.get("answer"))
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(
            f"[ok] {slug}: filled {filled} answers from {key_pdf_name}. "
            f"Now {data['answered_count']} / {data['question_count']} answered."
        )


if __name__ == "__main__":
    main()
