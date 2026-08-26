from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def build(report: dict[str, Any]) -> str:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for line in report["lines"]:
        grouped[(line["source"], line["date"], line["focus"])].append(line)

    statements = ["PRAGMA foreign_keys = ON;"]
    for (source, local_date, focus), lines in sorted(grouped.items()):
        source_ref = f"{source}:{local_date}"
        statements.append(
            "INSERT INTO workout_sessions("
            "user_id, local_date, focus, source_kind, source_ref, notes, confirmed_at"
            ") SELECT id, "
            f"{sql_text(local_date)}, {sql_text(focus)}, 'word_import', {sql_text(source_ref)}, "
            f"{sql_text('Фактически выполненная тренировка из ' + source)}, CURRENT_TIMESTAMP FROM users "
            "WHERE 1 = 1 ON CONFLICT(user_id, local_date, source_kind, source_ref) DO UPDATE SET "
            "focus=excluded.focus, notes=excluded.notes, confirmed_at=excluded.confirmed_at;"
        )
        statements.append(
            "DELETE FROM set_logs WHERE session_id=(SELECT session.id FROM workout_sessions session "
            "JOIN users ON users.id=session.user_id WHERE session.local_date="
            f"{sql_text(local_date)} AND session.source_kind='word_import' AND session.source_ref={sql_text(source_ref)});"
        )
        statements.append(
            "DELETE FROM workout_session_exercises WHERE session_id=(SELECT session.id FROM workout_sessions session "
            "JOIN users ON users.id=session.user_id WHERE session.local_date="
            f"{sql_text(local_date)} AND session.source_kind='word_import' AND session.source_ref={sql_text(source_ref)});"
        )
        position = 0
        for line in sorted(lines, key=lambda item: item["position"]):
            candidates = line.get("candidates", [])
            if line.get("line_kind") == "header" or not candidates:
                continue
            superset_group = f"source-{line['position']}" if len(candidates) > 1 else None
            for candidate in candidates:
                position += 1
                statements.append(
                    "INSERT INTO workout_session_exercises("
                    "session_id, exercise_id, position, source_position, superset_group, raw_text, "
                    "match_confidence, match_status, notes"
                    ") SELECT session.id, exercise.id, "
                    f"{position}, {int(line['position'])}, {sql_text(superset_group)}, {sql_text(line['text'])}, "
                    f"{float(candidate['confidence'])}, "
                    f"{sql_text('owner_reviewed' if line['status'] == 'confirmed' else 'auto_matched')}, "
                    f"{sql_text('Правило: ' + candidate['rule'])} "
                    "FROM workout_sessions session JOIN users ON users.id=session.user_id "
                    f"JOIN exercises exercise ON exercise.name={sql_text(candidate['exercise'])} "
                    f"WHERE session.local_date={sql_text(local_date)} AND session.source_kind='word_import' "
                    f"AND session.source_ref={sql_text(source_ref)};"
                )

    statements.append(
        "UPDATE imported_documents SET status='confirmed', reviewed_at=CURRENT_TIMESTAMP "
        "WHERE status='needs_review' AND id IN (SELECT DISTINCT imported_document_id FROM imported_workout_lines);"
    )
    statements.append("")
    return "\n".join(statements)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build(report), encoding="utf-8")
    session_keys = {(x["source"], x["date"]) for x in report["lines"]}
    print(json.dumps({"sessions": len(session_keys)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
