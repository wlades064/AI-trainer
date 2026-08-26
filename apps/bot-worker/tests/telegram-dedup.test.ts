import test from "node:test";
import assert from "node:assert/strict";
import { claimTelegramUpdate, failTelegramUpdate, type D1Database, type D1PreparedStatement } from "../src/db.ts";

function fakeDatabase(): D1Database {
  const states = new Map<number, string>();
  return {
    prepare(query: string): D1PreparedStatement {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) { values = bound; return this; },
        async first<T>() {
          const updateId = Number(values[0]);
          const current = states.get(updateId);
          if (query.startsWith("INSERT INTO telegram_updates") && (!current || current === "failed")) {
            states.set(updateId, "processing");
            return { update_id: updateId } as T;
          }
          return null;
        },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          if (query.startsWith("UPDATE telegram_updates SET status = 'failed'")) {
            states.set(Number(values[1]), "failed");
          }
          return {};
        },
      };
    },
  };
}

test("the same Telegram update is processed only once", async () => {
  const db = fakeDatabase();
  assert.equal(await claimTelegramUpdate(db, 100), true);
  assert.equal(await claimTelegramUpdate(db, 100), false);
});

test("a failed Telegram update may be retried", async () => {
  const db = fakeDatabase();
  assert.equal(await claimTelegramUpdate(db, 101), true);
  await failTelegramUpdate(db, 101, "temporary failure");
  assert.equal(await claimTelegramUpdate(db, 101), true);
});
