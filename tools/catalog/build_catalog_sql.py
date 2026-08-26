from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build_sql(catalog: dict[str, Any]) -> str:
    statements = ["PRAGMA foreign_keys = ON;"]
    for item in catalog["exercises"]:
        name = sql_text(item["name"])
        group = sql_text(item["group"])
        equipment = sql_text(item.get("equipment"))
        instructions = sql_text(item.get("instructions"))
        details = {
            "catalog_version": catalog["version"],
            "needs_clarification": bool(item.get("needs_clarification", False)),
            **item.get("details", {}),
        }
        notes = sql_text(item.get("notes"))
        availability = sql_text(item.get("availability", "active"))
        role = sql_text(item.get("role", "either"))
        priority = int(item.get("priority", 0))

        statements.append(
            "INSERT INTO exercises(name, muscle_group, equipment, instructions) "
            f"VALUES ({name}, {group}, {equipment}, {instructions}) "
            "ON CONFLICT(name) DO UPDATE SET "
            "muscle_group=excluded.muscle_group, equipment=excluded.equipment, "
            "instructions=COALESCE(excluded.instructions, exercises.instructions), active=1;"
        )
        statements.append(
            "INSERT INTO user_exercise_settings("
            "user_id, exercise_id, availability, workout_role, priority, safety_notes, details_json, source"
            ") SELECT users.id, exercises.id, "
            f"{availability}, {role}, {priority}, {notes}, {sql_text(compact_json(details))}, "
            f"{sql_text(catalog['source'])} FROM users CROSS JOIN exercises WHERE exercises.name={name} "
            "ON CONFLICT(user_id, exercise_id) DO UPDATE SET "
            "availability=excluded.availability, workout_role=excluded.workout_role, "
            "priority=excluded.priority, safety_notes=excluded.safety_notes, "
            "details_json=excluded.details_json, source=excluded.source, updated_at=CURRENT_TIMESTAMP;"
        )
        for risk_tag in item.get("risk_tags", []):
            statements.append(
                "INSERT OR IGNORE INTO exercise_risk_tags(exercise_id, risk_tag) "
                f"SELECT id, {sql_text(risk_tag)} FROM exercises WHERE name={name};"
            )

    for key, value in catalog["preferences"].items():
        statements.append(
            "INSERT INTO training_preferences(user_id, preference_key, value_json) "
            f"SELECT id, {sql_text(key)}, {sql_text(compact_json(value))} FROM users WHERE 1 = 1 "
            "ON CONFLICT(user_id, preference_key) DO UPDATE SET "
            "value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP;"
        )
    statements.append("")
    return "\n".join(statements)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("catalog", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_sql(catalog), encoding="utf-8")


if __name__ == "__main__":
    main()
