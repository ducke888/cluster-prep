#!/usr/bin/env python3
"""Parse DECA Marketing Cluster sample exam PDFs into JSON.

Each PDF typically contains:
  - A set of 100 numbered questions, each with four options labeled A-D.
  - A key section (often titled "...EXAM—KEY") with entries like:
        NN. LETTER
        <explanation paragraph(s)>
        SOURCE: ...
        SOURCE: ...

We split the extracted text on the first occurrence of "KEY" on a header line
(or a line that contains both "EXAM" and "KEY"), then parse each half.

Output: one JSON file per exam in ../data/, plus an index.json.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import pymupdf

EXAMS_DIR = Path("/Users/aryank/Downloads/Sample Exams")
OUT_DIR = Path("/Users/aryank/DECA Study Website/data")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def extract_text(pdf_path: Path) -> str:
    doc = pymupdf.open(pdf_path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def split_questions_key(text: str) -> tuple[str, str]:
    """Split text into (questions_section, key_section) using the header that marks the key."""
    # Common header variants
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
    # Fallback: first occurrence of "KEY" as a standalone-ish word
    m = re.search(r"\bKEY\b", text)
    if m:
        return text[: m.start()], text[m.start():]
    return text, ""


QUESTION_RE = re.compile(
    r"(?m)^\s{0,4}(\d{1,3})\.\s+(.+?)(?=\n\s{0,4}A\.\s)",
    re.DOTALL,
)


def parse_questions(text: str) -> dict[int, dict]:
    """Return mapping of question number -> {question, options: {A,B,C,D}}."""
    # Normalize line endings & strip page headers/footers that don't help.
    # We'll look for blocks numbered N. text ... A. ... B. ... C. ... D. ...
    # Use a staged regex: find each "NN." start then grab until the next question or end.
    questions: dict[int, dict] = {}
    # Find all candidate question starts (at start of a line, number period space)
    starts = [m for m in re.finditer(r"(?m)^\s{0,4}(\d{1,3})\.\s", text)]
    for i, m in enumerate(starts):
        num = int(m.group(1))
        start = m.end()
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        block = text[start:end]
        # Now parse out question stem + A-D options
        # Find positions of A. B. C. D. at line starts
        opt_positions = []
        for letter in "ABCD":
            om = re.search(r"(?m)^\s{0,6}" + letter + r"\.\s", block)
            if om:
                opt_positions.append((letter, om.start(), om.end()))
        if len(opt_positions) < 4:
            continue  # not a real question (could be key entry that was mis-split)
        # Question stem = everything before first option
        stem = block[: opt_positions[0][1]].strip()
        stem = re.sub(r"\s+", " ", stem)
        options = {}
        for idx, (letter, _s, text_start) in enumerate(opt_positions):
            next_start = opt_positions[idx + 1][1] if idx + 1 < len(opt_positions) else len(block)
            opt_text = block[text_start:next_start].strip()
            # Strip trailing whitespace/footer noise
            opt_text = re.sub(r"\s+", " ", opt_text)
            options[letter] = opt_text
        # Skip entries that look like keys (e.g. if stem is empty or too short for a real question)
        if not stem:
            continue
        # filter: real questions should have stem with >3 words OR end with ? or :
        if len(stem.split()) < 2:
            continue
        # Heuristic: a key entry looks like "A. 42. B ..." which is different; this regex catches only ones starting with a number. A key letter-only entry like "88. C" wouldn't have A./B./C./D. options, so we naturally skip it.
        questions[num] = {
            "number": num,
            "question": stem,
            "options": options,
        }
    return questions


def parse_key(text: str) -> dict[int, dict]:
    """Return mapping of question number -> {answer, explanation}.

    Key entries look like:
        NN. X
        <paragraph>
        SOURCE: ...
        SOURCE: ...
    where X is one of A/B/C/D.
    """
    # Find each entry start: number.  letter at a line
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
        # Strip out SOURCE: lines for a cleaner explanation but keep them in a separate field
        lines = body.splitlines()
        expl_lines = []
        source_lines = []
        for line in lines:
            if re.match(r"^\s*SOURCE\s*:", line, flags=re.IGNORECASE):
                source_lines.append(line.strip())
            else:
                expl_lines.append(line)
        explanation = " ".join(l.strip() for l in expl_lines if l.strip())
        # Also collapse excessive whitespace
        explanation = re.sub(r"\s+", " ", explanation).strip()
        # Drop footer residue like "Test 1121 ... 32"
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


def parse_exam(pdf_path: Path) -> dict:
    text = extract_text(pdf_path)
    q_text, k_text = split_questions_key(text)
    questions = parse_questions(q_text)
    key = parse_key(k_text) if k_text else {}
    # Merge
    merged = []
    for num in sorted(questions.keys()):
        q = questions[num]
        k = key.get(num, {})
        merged.append(
            {
                "number": num,
                "question": q["question"],
                "options": q["options"],
                "answer": k.get("answer"),
                "explanation": k.get("explanation", ""),
                "sources": k.get("sources", []),
            }
        )
    return {
        "file": pdf_path.name,
        "question_count": len(merged),
        "answered_count": sum(1 for m in merged if m["answer"]),
        "questions": merged,
    }


def slugify(name: str) -> str:
    base = name.lower()
    base = re.sub(r"\.pdf$", "", base)
    base = re.sub(r"^copy of ", "", base)
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base


def main() -> None:
    pdfs = sorted(EXAMS_DIR.glob("*.pdf"))
    index = []
    for pdf in pdfs:
        name = pdf.stem
        # Skip the standalone "Key" PDFs if a combined file exists; otherwise include.
        # We'll detect them by looking for "Key" in the name.
        is_standalone_key = re.search(r"key", name, flags=re.IGNORECASE) is not None
        if is_standalone_key:
            # We'll include them if there's no non-key counterpart — but typically
            # the non-key file is a full exam+key combined. Skip for now; note in log.
            print(f"[skip-key] {pdf.name}", file=sys.stderr)
            continue
        try:
            data = parse_exam(pdf)
        except Exception as e:  # noqa: BLE001
            print(f"[error] {pdf.name}: {e}", file=sys.stderr)
            continue
        slug = slugify(name)
        out_path = OUT_DIR / f"{slug}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        # Derive pretty title
        title = re.sub(r"^Copy of ", "", name)
        index.append(
            {
                "slug": slug,
                "title": title,
                "file": pdf.name,
                "question_count": data["question_count"],
                "answered_count": data["answered_count"],
                "json": f"data/{slug}.json",
            }
        )
        print(
            f"[ok] {pdf.name}: {data['question_count']} questions, "
            f"{data['answered_count']} with answers -> {out_path.name}"
        )

    # Order index by extracted exam number if any, else alphabetically.
    def sort_key(item: dict) -> tuple:
        m = re.search(r"(\d+)", item["title"])
        n = int(m.group(1)) if m else 9999
        return (n, item["title"])

    index.sort(key=sort_key)
    with (OUT_DIR / "index.json").open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {len(index)} exam JSON files to {OUT_DIR}")


if __name__ == "__main__":
    main()
