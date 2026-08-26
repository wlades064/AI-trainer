"""Extract a .docx workout document into a reviewable JSON draft."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": WORD_NS}


def _text(element: ElementTree.Element) -> str:
    return "".join(node.text or "" for node in element.findall(".//w:t", NS)).strip()


def extract_docx(path: Path) -> dict[str, Any]:
    if path.suffix.lower() != ".docx":
        raise ValueError("Поддерживаются только файлы .docx")
    if not path.is_file():
        raise FileNotFoundError(path)

    raw = path.read_bytes()
    with zipfile.ZipFile(path) as archive:
        try:
            document_xml = archive.read("word/document.xml")
        except KeyError as error:
            raise ValueError("Файл не содержит корректный документ Word") from error

    root = ElementTree.fromstring(document_xml)
    body = root.find("w:body", NS)
    if body is None:
        raise ValueError("В документе Word отсутствует содержимое")

    blocks: list[dict[str, Any]] = []
    for child in body:
        if child.tag == f"{{{WORD_NS}}}p":
            value = _text(child)
            if value:
                blocks.append({"type": "paragraph", "text": value})
        elif child.tag == f"{{{WORD_NS}}}tbl":
            rows: list[list[str]] = []
            for row in child.findall("w:tr", NS):
                rows.append([_text(cell) for cell in row.findall("w:tc", NS)])
            if rows:
                blocks.append({"type": "table", "rows": rows})

    return {
        "schema_version": 1,
        "status": "needs_review",
        "source": {
            "filename": path.name,
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "blocks": blocks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Создать JSON-черновик из Word-тренировок")
    parser.add_argument("source", type=Path, help="Путь к .docx")
    parser.add_argument("--output", type=Path, help="Путь результата; по умолчанию рядом с исходником")
    args = parser.parse_args()

    output = args.output or args.source.with_suffix(".workout-draft.json")
    draft = extract_docx(args.source)
    output.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Черновик создан: {output}")
    print(f"Блоков найдено: {len(draft['blocks'])}. Статус: needs_review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
