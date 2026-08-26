from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Rule:
    key: str
    exercise: str
    pattern: str
    confidence: float = 0.98
    exclude: str | None = None


RULES = (
    Rule("chest_butterfly", "Сведение рук в бабочке на грудь", r"сведен\w* рук.*бабоч|бабоч\w*.*сведен"),
    Rule("chest_crossover", "Сведение рук в кроссовере на грудь", r"сведен\w* рук.*кроссовер"),
    Rule("chest_hammer_upper", "Жим в Хаммере на верх груди", r"жим.*(?:хаммер|тренажер).*верх(?:н\w+)? (?:отдел|груд)|жим.*хаммер.*верх груд"),
    Rule("chest_hammer_middle", "Жим в Хаммере на середину груди", r"жим.*хаммер.*(?:середин|средн\w+ отдел)"),
    Rule("chest_hammer_near_butterfly", "Жим в Хаммере на низ груди", r"жим.*хаммер.*ближе к бабочк"),
    Rule("chest_hammer_lower", "Жим в Хаммере на низ груди", r"жим.*хаммер.*(?:низ|нижн\w+ отдел)"),
    Rule("chest_smith_incline", "Жим в Смитте на наклонной скамье", r"жим.*смит\w*.*(?:уг(?:о)?л|наклон)"),
    Rule("chest_dips", "Отжимания на брусьях", r"отжиман\w*.*брусь"),
    Rule("rack_pushup_level_3", "Отжимания от грифа в силовой раме, уровень 3", r"отжиман\w*.*(?:3|треть)\w* уров|отжиман\w*.*силов\w+ рам"),
    Rule("shoulder_hammer_press", "Жим в Хаммере на плечи", r"жим.*хаммер.*(?:дельт|плеч|75 град)"),
    Rule("shoulder_machine_press_ambiguous", "Жим в Хаммере на плечи", r"^жим в тренажере сидя"),
    Rule("shoulder_smith_press", "Жим в Смитте на плечи", r"жим.*смит\w*.*(?:дельт|плеч|75 град)"),
    Rule("middle_delt_raise_standing", "Махи гантелями в стороны стоя", r"махи.*гантел\w*.*(?:стоя|через сторон)(?!.*сидя)"),
    Rule("middle_delt_raise_seated", "Махи гантелями в стороны сидя", r"махи.*гантел\w*.*сидя"),
    Rule("middle_delt_raise_generic", "Махи гантелями в стороны стоя", r"махи.*гантел", exclude=r"сидя|вращен|уголок"),
    Rule("dumbbell_rotation", "Вращения с гантелями", r"вращен\w*.*гантел|вращен\w* \d"),
    Rule("front_plate_raise", "Подъем блина перед собой стоя", r"подъем.*блин.*перед собой", confidence=0.9),
    Rule("upright_barbell_row", "Тяга штанги к подбородку", r"тяг\w* штанг\w*.*(?:подбород|широк\w+ хват)"),
    Rule("rear_delt_butterfly", "Отведение рук в бабочке на заднюю дельту", r"(?:задн\w+ дельт.*бабоч|отведен\w*.*бабоч)"),
    Rule("rear_delt_cable", "Тяга в кроссовере на заднюю дельту", r"(?:тяг\w*.*(?:канат|кроссовер).*задн\w+ дельт|задн\w+ дельт.*(?:канат|кроссовер))"),
    Rule("triceps_horseshoe", "Разгибание рук в кроссовере подковой", r"разгибан\w*.*подков"),
    Rule("triceps_rope", "Разгибание рук в кроссовере канатной рукоятью", r"разгибан\w*.*(?:яйц|канат)"),
    Rule("triceps_ez_reverse", "Разгибание рук в кроссовере EZ-рукоятью обратным хватом", r"разгибан\w*.*(?:ez|ез|еz).*обратн\w+ хват"),
    Rule("triceps_ez_overhand", "Разгибание рук в кроссовере EZ-рукоятью прямым хватом", r"разгибан\w*.*(?:ez|ез|еz)(?!.*обратн\w+ хват)"),
    Rule("triceps_unspecified", "Разгибание рук в кроссовере без уточненной рукояти", r"разгибан\w*.*(?:блок|кроссовер).*трицепс", confidence=0.85, exclude=r"подков|яйц|канат|ez|ез|еz"),
    Rule("french_press_dumbbells", "Французский жим с гантелями", r"франц\w* жим.*гантел"),

    Rule("pullup", "Подтягивания", r"подтягиван"),
    Rule("tbar_row", "Тяга Т-грифа", r"тяг\w* т[- ]?гриф"),
    Rule("hammer_vertical_parallel", "Верхняя тяга в Хаммере параллельным хватом", r"(?:вертикальн|верхн).*тяг\w*.*хаммер.*параллельн"),
    Rule("hammer_vertical", "Верхняя тяга в Хаммере прямым хватом", r"(?:вертикальн|верхн).*тяг\w*.*хаммер", exclude=r"параллельн"),
    Rule("hammer_horizontal_one_arm", "Горизонтальная тяга в Хаммере по одной руке", r"горизонтальн\w+ тяг\w*.*хаммер.*(?:одн\w+ рук|на руку)|тяг\w*.*одн\w+ рук\w*.*хаммер"),
    Rule("hammer_horizontal_one_arm_short", "Горизонтальная тяга в Хаммере по одной руке", r"тяг\w*.*хаммер.*(?:по одной руке|на сторону)|тяг\w* горизонтальн\w* по одной руке"),
    Rule("hammer_horizontal_two_arms", "Горизонтальная тяга в Хаммере двумя руками", r"горизонтальн\w+ тяг\w*.*хаммер.*двумя рук|горизонтальн\w+ тяг\w* двумя рук\w*.*хаммер"),
    Rule("shrug_machine", "Шраги в телеге", r"шраг\w*.*(?:тренажер|телег)|трапец\w*.*тренажер"),
    Rule("shrug_barbell", "Шраги со штангой", r"шраг\w*.*штанг"),
    Rule("cable_floor_levels", "Тяга в кроссовере сидя на полу с понижением уровней 30-28-26-24", r"тяг(?=.*сидя на полу)(?=.*(?:краб|широк\w+ ручк))(?=.*30)(?=.*(?:28|27|26|24|22|21|18)).*"),
    Rule("cable_floor_levels_continuation", "Тяга в кроссовере сидя на полу с понижением уровней 30-28-26-24", r"начало тяги.*30.*28.*26.*24", confidence=0.9),
    Rule("cable_floor_30", "Тяга в кроссовере сидя на полу с уровня 30 на середину спины", r"тяг(?=.*сидя на полу)(?=.*(?:краб|широк\w+ ручк))(?=.*(?:30|уровн)).*"),
    Rule("cable_floor_30_context_missing", "Тяга в кроссовере сидя на полу с уровня 30 на середину спины", r"тяг\w*.*кроссовер.*широк\w+.*краб.*30 уров"),
    Rule("cable_horizontal_wide", "Горизонтальная тяга в кроссовере широким крабом на середину спины", r"(?:горизонтальн\w+ тяг|тяг\w*).*широк\w+ краб", exclude=r"сидя на полу"),
    Rule("cable_horizontal_reverse_narrow", "Горизонтальная тяга в кроссовере обратным узким крабом", r"(?:горизонтальн\w+ тяг|тяг\w* горизонтальн).*обратн\w*.*краб|тяг\w*.*обратн\w* краб.*горизонтальн"),
    Rule("cable_horizontal_narrow", "Горизонтальная тяга в кроссовере прямым узким крабом на круглые мышцы", r"(?:горизонтальн\w+ тяг|тяг\w* горизонтальн).*прям\w*.*краб|тяг\w*.*краб\w* прям\w*.*горизонтальн"),
    Rule("cable_rear_wide", "Верхняя тяга в кроссовере широким крабом на середину спины", r"тяг\w*.*широк\w+ краб.*(?:25|середин|верхн)|широк\w+ краб.*тяг"),
    Rule("lat_pulldown_wheel", "Верхняя тяга в кроссовере рулем на широчайшие", r"(?:верхн\w+|вертикальн\w+) тяг\w*.*рул|тяг\w* вертикальн\w*.*рул"),
    Rule("lat_pulldown_reverse_crab", "Верхняя тяга в кроссовере узким обратным крабом на широчайшие", r"верхн\w+ тяг\w*.*(?:узк\w+ обратн|обратн\w+ узк).*краб"),
    Rule("pullover_rope", "Пуловер в кроссовере канатной рукоятью", r"пуловер.*(?:канат|яйц)"),
    Rule("pullover_ez", "Пуловер в кроссовере EZ-рукоятью", r"пуловер.*(?:ez|ез|еz)"),
    Rule("pullover_rope_typo", "Пуловер в кроссовере канатной рукоятью", r"пулловер.*(?:канат|яйц)"),
    Rule("pullover_ez_typo", "Пуловер в кроссовере EZ-рукоятью", r"пулловер.*(?:ez|ез|еz)"),
    Rule("pullover_unspecified", "Пуловер в кроссовере без уточненной рукояти", r"пулл?овер", confidence=0.9, exclude=r"канат|яйц|ez|ез|еz"),
    Rule("biceps_scott_machine", "Сгибание рук в тренажере Скотта", r"(?:бицепс|сгибан\w* рук).*тренажер\w* скотт|скотт\w*.*двумя рук"),
    Rule("biceps_horseshoe_seated", "Сгибание рук в кроссовере подковой сидя", r"(?:сгибан\w* рук|сгибан\w* на бицепс|бицепс).*(?:подков.*сидя|сидя.*подков)"),
    Rule("biceps_horseshoe_standing", "Сгибание рук в кроссовере подковой стоя", r"(?:сгибан\w* рук|бицепс).*подков", exclude=r"сидя"),
    Rule("biceps_hammer", "Сгибание рук с гантелями молотковым хватом", r"молотк\w*.*гантел|гантел\w*.*молотк"),
    Rule("biceps_hammer_short", "Сгибание рук с гантелями молотковым хватом", r"\bмолотки\b"),
    Rule("biceps_rope", "Сгибание рук в кроссовере канатной рукоятью", r"(?:бицепс|сгибан\w*|подъем).*кроссовер.*(?:яйц|канат)"),
    Rule("biceps_ez_cable", "Сгибание рук в кроссовере EZ-рукоятью стоя", r"сгибан\w*.*бицепс.*кроссовер.*(?:ez|ез|еz)|сгибан\w*.*кроссовер.*(?:ez|ез|еz)"),
    Rule("biceps_scott_dumbbell", "Сгибание рук с гантелями на скамье Скотта", r"(?:подъем|сгибан\w*).*гантел\w*.*скотт"),

    Rule("leg_curl_seated", "Сгибание ног в тренажере сидя", r"сгибан\w* (?:ног|голен).*сидя"),
    Rule("leg_curl_lying_single", "Сгибание ноги в тренажере лежа по одной ноге", r"сгибан\w* (?:ног|голен).*леж.*(?:одн\w+ ног|по одной)"),
    Rule("leg_curl_lying", "Сгибание ног в тренажере лежа", r"сгибан\w* (?:ног|голен).*леж", exclude=r"одн\w+ ног|по одной"),
    Rule("leg_curl_lying_short", "Сгибание ног в тренажере лежа", r"сгибан\w* лежа"),
    Rule("leg_extension_reclined", "Разгибание ног в тренажере полулежа", r"разгибан\w* (?:ног|голен).*полулеж"),
    Rule("leg_extension_seated", "Разгибание ног в тренажере сидя", r"разгибан\w* (?:ног|голен).*сидя"),
    Rule("romanian_deadlift", "Румынская тяга", r"румынск\w+ тяг|тяг\w* (?:штанг\w* )?на прямых ног|тяг\w* на прямых ногах штанг"),
    Rule("straight_leg_belt_machine", "Тяга в колодце на прямых ногах", r"тяг\w* в колодце на прямых ног"),
    Rule("hyperextension", "Гиперэкстензия", r"гипер.*стенз"),
    Rule("pendulum_hack_face", "Приседания в маятниковом гакке лицом к спинке", r"присед\w*.*гакк\w*.*лицом"),
    Rule("leg_press_medium", "Жим ногами со средней постановкой ног", r"жим ног\w*.*(?:средн\w+ постанов|квадрицепс)"),
    Rule("leg_press_high", "Жим ногами с высокой постановкой ног", r"жим ног\w*.*(?:(?:высок|верхн)\w+ постанов|задн\w+ поверх)"),
    Rule("leg_press_generic", "Жим ногами со средней постановкой ног", r"жим ног\w*", exclude=r"одн\w+ ног|по одной|(?:высок|верхн)\w+ постанов|задн\w+ поверх"),
    Rule("hip_abduction", "Отведение бедра в тренажере", r"отведен\w* бедр|отведен\w* ног"),
    Rule("hip_adduction", "Приведение бедра в тренажере", r"приведен\w* бедр|сведен\w* (?:бедр|ног)"),
    Rule("hip_adduction_short", "Приведение бедра в тренажере", r"^приведение\b|^сведение ровным"),
    Rule("calf_machine", "Подъем на икры в тренажере", r"(?:подъем|икр).*икр.*тренажер|икр\w*.*тренажер|тренажер.*икр"),
    Rule("calf_podium", "Подъем на икры на подиуме", r"(?:подъем|икр).*икр.*(?:подиум|уступ)|(?:икр|носок)\w*.*(?:подиум|уступ)"),
    Rule("calf_leg_press", "Подъем на носки в тренажере для жима ногами", r"подъем на носки.*жим\w* ног"),
    Rule("glute_bridge", "Ягодичный мост в тренажере", r"ягодичн\w+ мост"),
)


def normalize(text: str) -> str:
    value = text.casefold().replace("ё", "е")
    value = re.sub(r"^\s*\d+[.)]?\s*", "", value)
    return re.sub(r"\s+", " ", value).strip()


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def match_line(text: str) -> list[Rule]:
    normalized = normalize(text)
    matches: list[Rule] = []
    seen: set[str] = set()
    for rule in RULES:
        if rule.exercise in seen:
            continue
        if re.search(rule.pattern, normalized, re.IGNORECASE) and not (
            rule.exclude and re.search(rule.exclude, normalized, re.IGNORECASE)
        ):
            matches.append(rule)
            seen.add(rule.exercise)
    return matches


def classify_line(text: str) -> str:
    normalized = normalize(text)
    if re.fullmatch(r"грудь дельты трицепс.*", normalized):
        return "header"
    if normalized.startswith("начало тяги"):
        return "continuation"
    return "exercise"


def build(drafts: list[dict[str, Any]], catalog: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    catalog_names = {item["name"] for item in catalog["exercises"]}
    missing = sorted({rule.exercise for rule in RULES} - catalog_names)
    if missing:
        raise ValueError(f"Правила ссылаются на отсутствующие упражнения: {missing}")

    sql = ["PRAGMA foreign_keys = ON;"]
    report_lines: list[dict[str, Any]] = []
    for draft in drafts:
        source = draft["source"]
        sha256 = source["sha256"]
        for session in draft["sessions"]:
            for raw in session["raw_exercises"]:
                text = raw["text"]
                line_kind = classify_line(text)
                matches = [] if line_kind == "header" else match_line(text)
                status = "unmatched"
                if line_kind == "header":
                    status = "confirmed"
                elif matches:
                    status = "auto_matched" if min(x.confidence for x in matches) >= 0.9 else "needs_review"
                normalized = normalize(text)
                sql.append(
                    "INSERT INTO imported_workout_lines("
                    "imported_document_id, local_date, focus, position, raw_text, normalized_text, line_kind, match_status"
                    ") SELECT id, "
                    f"{sql_text(session['date'])}, {sql_text(session['focus'])}, {int(raw['position'])}, "
                    f"{sql_text(text)}, {sql_text(normalized)}, {sql_text(line_kind)}, {sql_text(status)} "
                    f"FROM imported_documents WHERE sha256={sql_text(sha256)} "
                    "ON CONFLICT(imported_document_id, local_date, position) DO UPDATE SET "
                    "raw_text=excluded.raw_text, normalized_text=excluded.normalized_text, line_kind=excluded.line_kind, "
                    "match_status=excluded.match_status, updated_at=CURRENT_TIMESTAMP;"
                )
                sql.append(
                    "DELETE FROM imported_line_candidates WHERE line_id=("
                    "SELECT line.id FROM imported_workout_lines line "
                    "JOIN imported_documents document ON document.id=line.imported_document_id "
                    f"WHERE document.sha256={sql_text(sha256)} "
                    f"AND line.local_date={sql_text(session['date'])} AND line.position={int(raw['position'])}"
                    ");"
                )
                for rule in matches:
                    sql.append(
                        "INSERT INTO imported_line_candidates(line_id, exercise_id, confidence, match_rule) "
                        "SELECT line.id, exercise.id, "
                        f"{rule.confidence}, {sql_text(rule.key)} "
                        "FROM imported_workout_lines line "
                        "JOIN imported_documents document ON document.id=line.imported_document_id "
                        f"JOIN exercises exercise ON exercise.name={sql_text(rule.exercise)} "
                        f"WHERE document.sha256={sql_text(sha256)} "
                        f"AND line.local_date={sql_text(session['date'])} AND line.position={int(raw['position'])} "
                        "ON CONFLICT(line_id, exercise_id) DO UPDATE SET "
                        "confidence=excluded.confidence, match_rule=excluded.match_rule;"
                    )
                report_lines.append({
                    "source": source["filename"],
                    "date": session["date"],
                    "focus": session["focus"],
                    "position": raw["position"],
                    "text": text,
                    "line_kind": line_kind,
                    "status": status,
                    "matches": [rule.exercise for rule in matches],
                    "candidates": [
                        {"exercise": rule.exercise, "confidence": rule.confidence, "rule": rule.key}
                        for rule in matches
                    ],
                })

    counts = {
        "total": len(report_lines),
        "auto_matched": sum(x["status"] == "auto_matched" for x in report_lines),
        "needs_review": sum(x["status"] == "needs_review" for x in report_lines),
        "unmatched": sum(x["status"] == "unmatched" for x in report_lines),
        "multi_exercise": sum(len(x["matches"]) > 1 for x in report_lines),
        "headers": sum(x["line_kind"] == "header" for x in report_lines),
    }
    return "\n".join(sql) + "\n", {"counts": counts, "lines": report_lines}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft-dir", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--sql-output", type=Path, required=True)
    parser.add_argument("--report-output", type=Path, required=True)
    args = parser.parse_args()
    drafts = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(args.draft_dir.glob("*.json"))]
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    sql, report = build(drafts, catalog)
    args.sql_output.parent.mkdir(parents=True, exist_ok=True)
    args.report_output.parent.mkdir(parents=True, exist_ok=True)
    args.sql_output.write_text(sql, encoding="utf-8")
    args.report_output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
