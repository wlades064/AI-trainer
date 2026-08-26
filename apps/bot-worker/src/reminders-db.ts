import type { D1Database } from "./db.ts";
import { localDateAt, toIsoDate, weekday } from "./domain/schedule.ts";
import { parseReminderInput, REMINDER_HELP } from "./reminders.ts";

type ReminderType = "weight" | "measurements";
interface ConversationRow { id: number }
interface SettingRow {
  reminder_type: ReminderType;
  enabled: number;
  weekday: number | null;
  day_of_month: number | null;
  local_hour: number;
}
interface DueRow extends SettingRow { user_id: number; telegram_user_id: string }

async function pending(db: D1Database, userId: number): Promise<ConversationRow | null> {
  return db.prepare(`SELECT id FROM reminder_conversations
    WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
    ORDER BY updated_at DESC LIMIT 1`).bind(userId).first<ConversationRow>();
}

function time(hour: number): string { return `${String(hour).padStart(2, "0")}:00`; }

async function settingsText(db: D1Database, userId: number): Promise<string> {
  const result = await db.prepare(`SELECT reminder_type,enabled,weekday,day_of_month,local_hour
    FROM reminder_settings WHERE user_id=?`).bind(userId).all<SettingRow>();
  const rows = new Map((result.results ?? []).map((row) => [row.reminder_type, row]));
  const weight = rows.get("weight");
  const measurements = rows.get("measurements");
  return [
    "Текущие напоминания:",
    `• вес: ${weight?.enabled ? `каждый понедельник в ${time(weight.local_hour)}` : "выключено"}`,
    `• замеры: ${measurements?.enabled ? `${measurements.day_of_month}-го числа в ${time(measurements.local_hour)}` : "выключено"}`,
  ].join("\n");
}

export async function startReminderConversation(db: D1Database, userId: number): Promise<string> {
  if (!(await pending(db, userId))) {
    await db.prepare("UPDATE reminder_conversations SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'").bind(userId).run();
    await db.prepare("INSERT INTO reminder_conversations(user_id,status,expires_at) VALUES(?,'pending',datetime('now','+2 days'))").bind(userId).run();
  }
  return `${await settingsText(db, userId)}\n\n${REMINDER_HELP}`;
}

export async function cancelReminderConversation(db: D1Database, userId: number): Promise<boolean> {
  const row = await pending(db, userId); if (!row) return false;
  await db.prepare("UPDATE reminder_conversations SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
  return true;
}

export async function answerReminderConversation(db: D1Database, userId: number, text: string): Promise<string | null> {
  const conversation = await pending(db, userId); if (!conversation) return null;
  const input = parseReminderInput(text); if (!input) return `Не понял настройку. ${REMINDER_HELP}`;
  if (input.kind === "weight") {
    await db.prepare(`INSERT INTO reminder_settings(user_id,reminder_type,enabled,weekday,day_of_month,local_hour,local_minute,updated_at)
      VALUES(?,'weight',1,1,NULL,?,0,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,reminder_type) DO UPDATE SET enabled=1,weekday=1,day_of_month=NULL,local_hour=excluded.local_hour,local_minute=0,updated_at=CURRENT_TIMESTAMP`)
      .bind(userId, input.hour).run();
  } else if (input.kind === "measurements") {
    await db.prepare(`INSERT INTO reminder_settings(user_id,reminder_type,enabled,weekday,day_of_month,local_hour,local_minute,updated_at)
      VALUES(?,'measurements',1,NULL,?,?,0,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,reminder_type) DO UPDATE SET enabled=1,weekday=NULL,day_of_month=excluded.day_of_month,local_hour=excluded.local_hour,local_minute=0,updated_at=CURRENT_TIMESTAMP`)
      .bind(userId, input.day, input.hour).run();
  } else {
    await db.prepare(`INSERT INTO reminder_settings(user_id,reminder_type,enabled,local_hour,local_minute,updated_at)
      VALUES(?,?,0,9,0,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,reminder_type) DO UPDATE SET enabled=0,updated_at=CURRENT_TIMESTAMP`)
      .bind(userId, input.type).run();
  }
  await db.prepare("UPDATE reminder_conversations SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(conversation.id).run();
  return `${input.kind === "disable" ? "Напоминание выключено." : "Напоминание сохранено."}\n\n${await settingsText(db, userId)}`;
}

function localHour(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  return Number(parts.find((part) => part.type === "hour")?.value);
}

async function alreadyRecorded(db: D1Database, row: DueRow, localDate: string): Promise<boolean> {
  if (row.reminder_type === "weight") {
    return (await db.prepare("SELECT id FROM body_measurements WHERE user_id=? AND measured_at=? AND kind='weight' LIMIT 1")
      .bind(row.user_id, localDate).first<{ id: number }>()) !== null;
  }
  const month = localDate.slice(0, 7);
  const count = await db.prepare(`SELECT COUNT(DISTINCT kind) AS count FROM body_measurements
    WHERE user_id=? AND substr(measured_at,1,7)=? AND kind IN ('chest','abdomen','biceps','shoulders','legs')`)
    .bind(row.user_id, month).first<{ count: number }>();
  return Number(count?.count ?? 0) >= 5;
}

export async function runDueReminders(
  db: D1Database,
  instant: Date,
  timeZone: string,
  deliver: (telegramUserId: string, text: string) => Promise<void>,
): Promise<number> {
  const date = localDateAt(instant, timeZone);
  const localDate = toIsoDate(date);
  const hour = localHour(instant, timeZone);
  const result = await db.prepare(`SELECT s.user_id,u.telegram_user_id,s.reminder_type,s.enabled,s.weekday,s.day_of_month,s.local_hour
    FROM reminder_settings s JOIN users u ON u.id=s.user_id
    WHERE s.enabled=1 AND s.local_hour=? AND s.local_minute=0`).bind(hour).all<DueRow>();
  let delivered = 0;
  for (const row of result.results ?? []) {
    const due = row.reminder_type === "weight" ? row.weekday === weekday(date) : row.day_of_month === date.day;
    if (!due || await alreadyRecorded(db, row, localDate)) continue;
    const claim = await db.prepare(`INSERT INTO reminder_deliveries(user_id,reminder_type,local_date,status)
      VALUES(?,?,?,'pending') ON CONFLICT(user_id,reminder_type,local_date) DO NOTHING RETURNING id`)
      .bind(row.user_id, row.reminder_type, localDate).first<{ id: number }>();
    if (!claim) continue;
    const text = row.reminder_type === "weight"
      ? "Напоминание о весе: обнови вес в FatSecret. Повторно вводить его в Telegram не нужно; команда /weight — только резерв, если импорт недоступен."
      : "Пора сделать ежемесячные замеры в одинаковых условиях. Нажми «📏 Замеры» и внеси фактические значения.";
    try {
      await deliver(row.telegram_user_id, text);
      await db.prepare("UPDATE reminder_deliveries SET status='delivered',delivered_at=CURRENT_TIMESTAMP WHERE id=?").bind(claim.id).run();
      delivered += 1;
    } catch (error) {
      await db.prepare("DELETE FROM reminder_deliveries WHERE id=? AND status='pending'").bind(claim.id).run();
      throw error;
    }
  }
  return delivered;
}
