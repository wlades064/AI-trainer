import type { D1Database } from "./db.ts";
import type { AiUsageOverview, AiUsageTotals } from "./ai-usage.ts";

interface UsageRow {
  local_date: string;
  purpose: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

function emptyTotals(): AiUsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0 };
}

function add(total: AiUsageTotals, row: UsageRow): void {
  total.requests += Number(row.requests) || 0;
  total.inputTokens += Number(row.input_tokens) || 0;
  total.outputTokens += Number(row.output_tokens) || 0;
}

function daysBefore(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function loadAiUsageOverview(db: D1Database, userId: number, localDate: string): Promise<AiUsageOverview> {
  const result = await db.prepare(
    `SELECT date(created_at, '+4 hours') AS local_date, purpose,
            COUNT(*) AS requests,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM ai_usage
     WHERE user_id = ?
       AND date(created_at, '+4 hours') BETWEEN date(?, '-29 days') AND ?
     GROUP BY date(created_at, '+4 hours'), purpose
     ORDER BY local_date DESC, purpose`,
  ).bind(userId, localDate, localDate).all<UsageRow>();

  const today = emptyTotals();
  const sevenDays = emptyTotals();
  const thirtyDays = emptyTotals();
  const sevenStart = daysBefore(localDate, 6);
  const todayByPurpose: AiUsageOverview["todayByPurpose"] = [];
  for (const row of result.results ?? []) {
    add(thirtyDays, row);
    if (row.local_date >= sevenStart) add(sevenDays, row);
    if (row.local_date === localDate) {
      add(today, row);
      todayByPurpose.push({
        purpose: row.purpose,
        requests: Number(row.requests) || 0,
        tokens: (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0),
      });
    }
  }
  return { today, sevenDays, thirtyDays, todayByPurpose };
}
