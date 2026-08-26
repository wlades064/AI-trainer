"""Build an idempotent D1 SQL file for imported_documents staging."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_sql(drafts: list[Path]) -> str:
    statements = ["PRAGMA foreign_keys = ON;"]
    for path in drafts:
        draft = json.loads(path.read_text(encoding="utf-8"))
        source = draft["source"]
        payload = json.dumps(draft, ensure_ascii=False, separators=(",", ":"))
        values = ", ".join([
            "(SELECT id FROM users ORDER BY id LIMIT 1)",
            _sql_string(source["filename"]),
            _sql_string(source["sha256"]),
            "'needs_review'",
            _sql_string(payload),
        ])
        statements.append(
            "INSERT INTO imported_documents (user_id, filename, sha256, status, draft_json) "
            f"VALUES ({values}) "
            "ON CONFLICT(user_id, sha256) DO UPDATE SET "
            "filename=excluded.filename, status='needs_review', draft_json=excluded.draft_json;"
        )
    return "\n".join(statements) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Создать SQL для staging Word-импорта")
    parser.add_argument("drafts", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_sql(args.drafts), encoding="utf-8")
    print(f"Подготовлено документов: {len(args.drafts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
