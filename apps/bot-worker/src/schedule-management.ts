import type{TrainingFocus}from"./domain/schedule.ts";
export type ScheduleAction="move"|"cancel"|"add"|"reset";
export function parseScheduleAction(text:string):ScheduleAction|null{const values:Record<string,ScheduleAction>={перенести:"move",отменить:"cancel",добавить:"add",сбросить:"reset"};return values[text.trim().toLocaleLowerCase("ru-RU")]??null}
function addDays(date:string,days:number):string{const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
export function parseScheduleDate(text:string,today:string):string|null{const value=text.trim().toLocaleLowerCase("ru-RU");if(value==="сегодня")return today;if(value==="завтра")return addDays(today,1);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const parsed=new Date(`${value}T00:00:00Z`);return Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value?null:value}
export function scheduleDateAllowed(date:string,today:string):boolean{return date>=today&&date<=addDays(today,90)}
export function parseScheduleFocus(text:string):Exclude<TrainingFocus,"rest">|null{const values:Record<string,Exclude<TrainingFocus,"rest">>={грудь:"chest",спина:"back",ноги:"legs"};return values[text.trim().toLocaleLowerCase("ru-RU")]??null}
export function isoDatePlus(date:string,days:number):string{return addDays(date,days)}
export const SCHEDULE_ACTION_HELP="Действия: перенести, отменить, добавить или сбросить.";
