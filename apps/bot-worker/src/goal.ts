export type GoalType = "fat_loss" | "muscle_gain" | "recomposition" | "maintenance";

const GOAL_ALIASES: Record<string, GoalType> = {
  "снижение жира": "fat_loss", "жиросжигание": "fat_loss", "похудение": "fat_loss", "fat_loss": "fat_loss",
  "набор мышц": "muscle_gain", "масса": "muscle_gain", "muscle_gain": "muscle_gain",
  "рекомпозиция": "recomposition", "рекомп": "recomposition", "recomposition": "recomposition",
  "поддержание": "maintenance", "maintenance": "maintenance",
};

export const GOAL_LABELS: Record<GoalType, string> = {
  fat_loss: "снижение жировой массы",
  muscle_gain: "набор мышечной массы",
  recomposition: "рекомпозиция: снижение жира с сохранением или постепенным набором мышц",
  maintenance: "поддержание текущей формы",
};

export function parseGoalCommand(text: string): GoalType | null {
  const match = text.trim().toLocaleLowerCase("ru-RU").match(/^\/goal(?:@\w+)?\s+(.+)$/);
  return match ? GOAL_ALIASES[match[1].trim()] ?? null : null;
}

export function goalHelp(): string {
  return ["Выбери текущую цель:", "• /goal рекомпозиция", "• /goal снижение жира", "• /goal набор мышц", "• /goal поддержание"].join("\n");
}
