"""Convert extracted Word workout paragraphs into reviewable dated sessions."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from import_docx import extract_docx

DATE_PATTERN = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$")
FOCUSES = {"chest", "back", "legs"}


def _iso_date(value: str) -> str:
    return datetime.strptime(value, "%d.%m.%Y").date().isoformat()


def parse_history(path: Path, focus: str) -> dict[str, Any]:
    if focus not in FOCUSES:
        raise ValueError(f"Неизвестная группа тренировки: {focus}")
    extracted = extract_docx(path)
    sessions: list[dict[str, Any]] = []
    warnings: list[str] = []
    current: dict[str, Any] | None = None

    for block in extracted["blocks"]:
        if block["type"] != "paragraph":
            warnings.append("Найден блок не-абзац; он сохранён только в исходном черновике")
            continue
        text = block["text"].strip()
        if DATE_PATTERN.fullmatch(text):
            if current is not None:
                sessions.append(current)
            current = {"date": _iso_date(text), "focus": focus, "raw_exercises": []}
            continue
        if current is None:
            warnings.append(f"Текст до первой даты: {text}")
            continue
        current["raw_exercises"].append({
            "position": len(current["raw_exercises"]) + 1,
            "text": text,
        })

    if current is not None:
        sessions.append(current)
    if not sessions:
        raise ValueError("В документе не найдено ни одной даты тренировки")
    for session in sessions:
        if not session["raw_exercises"]:
            warnings.append(f"Пустая тренировка: {session['date']}")

    return {
        "schema_version": 2,
        "status": "needs_review",
        "source": extracted["source"],
        "focus": focus,
        "session_count": len(sessions),
        "sessions": sessions,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Разделить Word-журнал на тренировки по датам")
    parser.add_argument("source", type=Path)
    parser.add_argument("--focus", required=True, choices=sorted(FOCUSES))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = parse_history(args.source, args.focus)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Сессий: {result['session_count']}; предупреждений: {len(result['warnings'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
