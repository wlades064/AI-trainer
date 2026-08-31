export const TOMORROW_WORKOUT_DISABLED =
  "Тренировку на завтра не составляю. План создаётся только в день тренировки после актуального предтренировочного чекина. В день тренировки нажми «🏋️ Сегодня».";

export async function dispatchWorkoutRequest(
  offset: 0 | 1,
  todayPipeline: () => Promise<string>,
): Promise<string> {
  if (offset === 1) return TOMORROW_WORKOUT_DISABLED;
  return todayPipeline();
}
