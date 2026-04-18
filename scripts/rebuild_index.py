#!/usr/bin/env python3
"""Rebuild data/index.json from the per-exam JSON files currently on disk."""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA_DIR = Path("/Users/aryank/DECA Study Website/data")

index = []
for json_path in sorted(DATA_DIR.glob("*.json")):
    if json_path.name == "index.json":
        continue
    data = json.loads(json_path.read_text())
    slug = json_path.stem
    title_raw = data.get("file", slug)
    title = re.sub(r"^Copy of ", "", title_raw)
    title = re.sub(r"\.pdf$", "", title)
    # Normalize: "Sample 16" -> "Sample Exam 16"
    if re.match(r"^Sample\s+\d+\b", title):
        title = title.replace("Sample ", "Sample Exam ", 1)
    index.append(
        {
            "slug": slug,
            "title": title,
            "file": data.get("file", ""),
            "question_count": data.get("question_count", 0),
            "answered_count": data.get("answered_count", 0),
            "available": data.get("question_count", 0) > 0,
            "json": f"data/{slug}.json",
        }
    )


def sort_key(item: dict) -> tuple:
    m = re.search(r"(\d+)", item["title"])
    n = int(m.group(1)) if m else 9999
    return (n, item["title"])


index.sort(key=sort_key)
(DATA_DIR / "index.json").write_text(
    json.dumps(index, ensure_ascii=False, indent=2)
)
print(f"Rebuilt index with {len(index)} entries")
for item in index:
    tag = "" if item["available"] else "  [UNAVAILABLE - image PDF, needs OCR]"
    print(f"  {item['title']}: {item['answered_count']}/{item['question_count']}{tag}")
