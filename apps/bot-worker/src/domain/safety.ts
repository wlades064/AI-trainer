export interface ExerciseCandidate {
  id: number;
  name: string;
  riskTags: string[];
  workoutRole?: "main" | "accessory" | "either";
  priority?: number;
}

export interface ActiveRestriction {
  bodyArea: string;
  avoidTags: string[];
  description?: string;
}

export interface ReadinessCheck {
  pain: number;
  hasNewSwelling: boolean;
  hasInstability: boolean;
  feelsUnwell: boolean;
}

export interface SafetyDecision {
  allowed: boolean;
  reasons: string[];
}

export function evaluateExercise(
  exercise: ExerciseCandidate,
  restrictions: ActiveRestriction[],
): SafetyDecision {
  const reasons = restrictions.flatMap((restriction) => {
    const matched = exercise.riskTags.filter((tag) => restriction.avoidTags.includes(tag));
    return matched.map((tag) => `${restriction.bodyArea}: запрещён риск «${tag}»`);
  });
  return { allowed: reasons.length === 0, reasons };
}

export function filterSafeExercises(
  exercises: ExerciseCandidate[],
  restrictions: ActiveRestriction[],
): { allowed: ExerciseCandidate[]; blocked: Array<ExerciseCandidate & { reasons: string[] }> } {
  const allowed: ExerciseCandidate[] = [];
  const blocked: Array<ExerciseCandidate & { reasons: string[] }> = [];
  for (const exercise of exercises) {
    const decision = evaluateExercise(exercise, restrictions);
    if (decision.allowed) allowed.push(exercise);
    else blocked.push({ ...exercise, reasons: decision.reasons });
  }
  return { allowed, blocked };
}

export function evaluateReadiness(check: ReadinessCheck): SafetyDecision {
  const reasons: string[] = [];
  if (!Number.isInteger(check.pain) || check.pain < 0 || check.pain > 10) {
    reasons.push("уровень боли должен быть целым числом от 0 до 10");
  } else if (check.pain >= 7) {
    reasons.push("сильная боль");
  }
  if (check.hasNewSwelling) reasons.push("новый отёк");
  if (check.hasInstability) reasons.push("ощущение нестабильности сустава");
  if (check.feelsUnwell) reasons.push("плохое общее самочувствие");
  return { allowed: reasons.length === 0, reasons };
}
