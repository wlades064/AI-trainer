import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

export async function restoreAndInspect(sqlPath, databasePath) {
  const sql = await readFile(sqlPath, "utf8");
  if (!/CREATE\s+TABLE[\s\S]*users/i.test(sql)) throw new Error("SQL-экспорт не содержит таблицу users");
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA foreign_keys=OFF;");
    database.exec(sql);
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyViolations.length) throw new Error(`После восстановления найдено нарушений внешних ключей: ${foreignKeyViolations.length}`);
    const row = database.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table') AS tablesCount,
      (SELECT COUNT(*) FROM users) AS usersCount,
      (SELECT COUNT(*) FROM workout_sessions WHERE confirmed_at IS NOT NULL) AS confirmedWorkouts`).get();
    return { ...row };
  } finally {
    database.close();
  }
}

async function main() {
  const [sqlPath, databasePath, receiptPath] = process.argv.slice(2);
  if (!sqlPath || !databasePath) throw new Error("Использование: node verify-sqlite.mjs <export.sql> <restored.sqlite3>");
  const result = await restoreAndInspect(sqlPath, databasePath);
  if (receiptPath) {
    await writeFile(receiptPath, `${JSON.stringify({ verifiedAt: new Date().toISOString(), ...result }, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`Восстановленная база: таблиц ${result.tablesCount}, пользователей ${result.usersCount}, подтверждённых тренировок ${result.confirmedWorkouts}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Неизвестная ошибка"}\n`);
    process.exitCode = 1;
  });
}
