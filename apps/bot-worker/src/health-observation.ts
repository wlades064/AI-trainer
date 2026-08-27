export type HealthMetric =
  | "sleep_duration"
  | "sleep_deep"
  | "sleep_rem"
  | "sleep_awake"
  | "resting_heart_rate"
  | "heart_rate_variability"
  | "steps"
  | "active_energy"
  | "oxygen_saturation"
  | "respiratory_rate"
  | "skin_temperature_delta"
  | "body_temperature"
  | "sleep_score"
  | "readiness_score";

export const SUPPORTED_HEALTH_METRICS: readonly HealthMetric[] = [
  "sleep_duration", "sleep_deep", "sleep_rem", "sleep_awake", "resting_heart_rate",
  "heart_rate_variability", "steps", "active_energy", "oxygen_saturation", "respiratory_rate",
  "skin_temperature_delta", "body_temperature", "sleep_score", "readiness_score",
];

export interface HealthObservationInput {
  metric: HealthMetric;
  value: number;
  unit: string;
  observedStart: string;
  observedEnd?: string;
  source: string;
  externalId?: string;
  quality: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedHealthObservation {
  metric: HealthMetric;
  value: number;
  unit: string;
  observedStart: string;
  observedEnd: string | null;
  source: string;
  externalId: string | null;
  quality: number;
  dedupKey: string;
  metadataJson: string;
}

function timestamp(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`${field}: требуется ISO-время с часовым поясом`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`${field}: некорректное время`);
  return new Date(milliseconds).toISOString();
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeValue(metric: HealthMetric, value: number, rawUnit: string): { value: number; unit: string } {
  if (!Number.isFinite(value)) throw new Error("Показатель должен быть конечным числом");
  const unit = rawUnit.trim().toLowerCase().replace(/\s+/g, "_");
  if (metric === "sleep_duration" || metric === "sleep_deep" || metric === "sleep_rem" || metric === "sleep_awake") {
    const minutes = ["min", "minute", "minutes", "минута", "минуты", "минут"].includes(unit) ? value
      : ["h", "hr", "hour", "hours", "час", "часа", "часов"].includes(unit) ? value * 60
        : ["s", "sec", "second", "seconds", "сек", "секунд"].includes(unit) ? value / 60 : Number.NaN;
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) throw new Error("Длительность сна вне диапазона 0–1440 минут");
    return { value: rounded(minutes), unit: "min" };
  }
  if (metric === "active_energy") {
    const kcal = ["kcal", "ккал"].includes(unit) ? value : ["kj", "кдж"].includes(unit) ? value / 4.184 : Number.NaN;
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 20_000) throw new Error("Активная энергия вне допустимого диапазона");
    return { value: rounded(kcal), unit: "kcal" };
  }
  if (metric === "oxygen_saturation") {
    const percent = ["%", "percent", "процент"].includes(unit) ? value : ["fraction", "ratio", "доля"].includes(unit) ? value * 100 : Number.NaN;
    if (!Number.isFinite(percent) || percent < 50 || percent > 100) throw new Error("Сатурация вне допустимого диапазона");
    return { value: rounded(percent), unit: "%" };
  }
  const rules: Record<Exclude<HealthMetric, "sleep_duration" | "sleep_deep" | "sleep_rem" | "sleep_awake" | "active_energy" | "oxygen_saturation">, { units: string[]; canonical: string; min: number; max: number; integer?: boolean }> = {
    resting_heart_rate: { units: ["bpm", "уд/мин"], canonical: "bpm", min: 20, max: 250 },
    heart_rate_variability: { units: ["ms", "мс"], canonical: "ms", min: 0, max: 1000 },
    steps: { units: ["count", "steps", "шаги"], canonical: "count", min: 0, max: 200_000, integer: true },
    respiratory_rate: { units: ["breaths/min", "breaths_per_min", "дыханий/мин"], canonical: "breaths/min", min: 3, max: 80 },
    skin_temperature_delta: { units: ["c", "°c", "celsius"], canonical: "°C", min: -10, max: 10 },
    body_temperature: { units: ["c", "°c", "celsius"], canonical: "°C", min: 30, max: 45 },
    sleep_score: { units: ["score", "points", "%"], canonical: "score", min: 0, max: 100 },
    readiness_score: { units: ["score", "points", "%"], canonical: "score", min: 0, max: 100 },
  };
  const rule = rules[metric];
  if (!rule.units.includes(unit)) throw new Error(`Неподдерживаемая единица для ${metric}: ${rawUnit}`);
  if (value < rule.min || value > rule.max) throw new Error(`${metric}: значение вне допустимого диапазона`);
  if (rule.integer && !Number.isInteger(value)) throw new Error(`${metric}: требуется целое число`);
  return { value: rounded(value), unit: rule.canonical };
}

export function normalizeHealthObservation(input: HealthObservationInput): NormalizedHealthObservation {
  if (!SUPPORTED_HEALTH_METRICS.includes(input.metric)) throw new Error("Неподдерживаемый тип показателя здоровья");
  const source = input.source.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,49}$/.test(source)) throw new Error("Некорректный идентификатор источника");
  if (!Number.isFinite(input.quality) || input.quality < 0 || input.quality > 1) throw new Error("Качество данных должно быть от 0 до 1");
  const observedStart = timestamp(input.observedStart, "observedStart");
  const observedEnd = input.observedEnd ? timestamp(input.observedEnd, "observedEnd") : null;
  if (observedEnd && observedEnd < observedStart) throw new Error("Конец наблюдения раньше начала");
  const normalized = normalizeValue(input.metric, input.value, input.unit);
  const externalId = input.externalId?.trim() || null;
  if (externalId && externalId.length > 200) throw new Error("externalId слишком длинный");
  const dedupKey = externalId
    ? `external:${input.metric}:${externalId}`
    : `canonical:${input.metric}:${observedStart}:${observedEnd ?? ""}:${normalized.value}:${normalized.unit}`;
  const metadataJson = JSON.stringify(input.metadata ?? {});
  if (metadataJson.length > 16_384) throw new Error("Метаданные показателя превышают 16 КБ");
  return {
    metric: input.metric,
    value: normalized.value,
    unit: normalized.unit,
    observedStart,
    observedEnd,
    source,
    externalId,
    quality: rounded(input.quality),
    dedupKey,
    metadataJson,
  };
}
