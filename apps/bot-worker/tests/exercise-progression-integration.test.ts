import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { applyProgressionGuard } from "../src/exercise-progression.ts";
import { loadExerciseProgression } from "../src/exercise-progression-db.ts";
import type { GeneratedWorkout } from "../src/gemini.ts";
import { confirmPendingReportDraft, saveReportDraft } from "../src/workout-report-db.ts";
import type { WorkoutReportDraft } from "../src/workout-report.ts";

function testDatabase(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDirectory = resolve(import.meta.dirname, "../../../db/migrations");
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(resolve(migrationsDirectory, filename), "utf8"));
  }
  function statement(sql: string, values: unknown[] = []): D1PreparedStatement {
    return {
      bind: (...next) => statement(sql, next),
      first: async <T>() => (sqlite.prepare(sql).get(...values as SQLInputValue[]) as T | undefined) ?? null,
      all: async <T>(): Promise<D1Result<T>> => ({ results: sqlite.prepare(sql).all(...values as SQLInputValue[]) as T[] }),
      run: async () => sqlite.prepare(sql).run(...values as SQLInputValue[]),
    };
  }
  return { db: { prepare: (sql) => statement(sql) }, sqlite };
}

function generatedWorkout(name: string): GeneratedWorkout {
  return {
    title: "Тестовый план",
    warmup: [],
    exercises: [{ name, sets: 4, reps: "12-15", weightGuidance: "Решение Gemini", restSeconds: 90, notes: "" }],
    cooldown: [],
    safetyNotes: [],
    programmingRationale: ["test"],
  };
}

function seedPlan(sqlite: DatabaseSync): void {
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare("INSERT INTO exercises(name,muscle_group)VALUES('Пуловер','back')").run();
  sqlite.prepare(`INSERT INTO workout_plans(
    user_id,planned_for,focus,emphasis,load_mode,status,generated_json
  )VALUES(1,'2026-08-26','back','lats','normal','sent',?)`).run(JSON.stringify(generatedWorkout("Пуловер")));
  sqlite.prepare(`INSERT INTO workout_plan_items(
    plan_id,exercise_id,position,target_sets,target_reps,rest_seconds
  )VALUES(1,1,1,4,'12-15',90)`).run();
}

function report(exercise: WorkoutReportDraft["exercises"][number]): WorkoutReportDraft {
  return {
    date: "2026-08-26",
    exercises: [exercise],
    cardio: [],
    pain: [],
    overallNotes: "",
    missingInformation: [],
  };
}

async function confirmWithStableCheckin(db: D1Database, sqlite: DatabaseSync, draft: WorkoutReportDraft): Promise<void> {
  await saveReportDraft(db, 1, 1, 900, "integration report", draft, "deterministic-test", 0, 0);
  const confirmed = await confirmPendingReportDraft(db, 1);
  sqlite.prepare(`UPDATE workout_sessions SET
    last_set_rir=2,technique_stable=1,pain_json='{"anyPain":false}',recovery_checkin_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(confirmed.sessionId);
}

test("plan to report to next plan lets Gemini interpret mixed working and back-off loads", async () => {
  const { db, sqlite } = testDatabase();
  seedPlan(sqlite);
  await confirmWithStableCheckin(db, sqlite, report({
    name: "Пуловер",
    status: "completed",
    performedAsPlanned: true,
    sets: [50, 50, 45, 45].map((weightKg) => ({ reps: 15, weightKg, loadBasis: "machine_display", setType: "working", notes: "" })),
    notes: "",
  }));

  const assessments = await loadExerciseProgression(db, 1, "back");
  const nextPlan = applyProgressionGuard(generatedWorkout("Пуловер"), assessments);

  assert.equal(assessments[0].decision, "hold");
  assert.match(assessments[0].reason, /разным весом/i);
  assert.equal(nextPlan.exercises[0].weightGuidance, "Решение Gemini");
  assert.match(nextPlan.exercises[0].notes, /тренерский сигнал/i);
  sqlite.close();
});

test("an explicit report substitution deterministically replaces the original exercise in the next plan", async () => {
  const { db, sqlite } = testDatabase();
  seedPlan(sqlite);
  sqlite.prepare("INSERT INTO exercises(name,muscle_group)VALUES('Тяга верхнего блока','back')").run();
  await confirmWithStableCheckin(db, sqlite, report({
    name: "Пуловер",
    status: "substituted",
    performedAsPlanned: false,
    substitutionName: "Тяга верхнего блока",
    sets: Array.from({ length: 4 }, () => ({ reps: 15, weightKg: 50, loadBasis: "machine_display", setType: "working", notes: "" })),
    notes: "",
  }));

  const assessments = await loadExerciseProgression(db, 1, "back");
  const nextPlan = applyProgressionGuard(
    generatedWorkout("Пуловер"),
    assessments,
    new Set(["Пуловер", "Тяга верхнего блока"]),
  );

  assert.equal(assessments[0].name, "Пуловер");
  assert.equal(assessments[0].decision, "replace_exercise");
  assert.equal(assessments[0].replacementName, "Тяга верхнего блока");
  assert.equal(nextPlan.exercises[0].name, "Тяга верхнего блока");
  assert.doesNotMatch(nextPlan.exercises[0].weightGuidance, /Решение Gemini/);
  sqlite.close();
});
