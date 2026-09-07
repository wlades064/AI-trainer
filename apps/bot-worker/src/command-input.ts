import type { D1Database } from './db.ts';
import { parseGoalCommand } from './goal.ts';
import { parseSupplementCommand, parseStopSupplementCommand } from './supplements.ts';
import { parseLabCommand, parseCancelLabCommand } from './labs.ts';

export type InputKind = 'goal' | 'supplement' | 'supplement_stop' | 'lab' | 'lab_cancel' | 'nutrition' | 'fatsecret' | 'export';
export interface PendingCommandInput { id: number; kind: InputKind }
export const INPUT_COMMANDS: Readonly<Record<string, InputKind>> = {
  '/export':'export',
  '/goal':'goal', '/supplements':'supplement', '/supplement':'supplement', '/supplement_stop':'supplement_stop',
  '/labs':'lab', '/lab':'lab', '/labphoto':'lab', '/lab_cancel':'lab_cancel', '/nutrition':'nutrition', '/fatsecret':'fatsecret',
};
const EXISTING_INPUT_FLOWS: Readonly<Record<string, readonly string[]>> = {
  '/today':['readiness','post_workout_checkin'], '/ready':['readiness'], '/checkin':['post_workout_checkin'],
  '/weight':['weight'], '/measure':['measurement'], '/illness':['illness'], '/injuries':['injury'],
  '/reintroductions':['reintroduction'], '/exercises':['exercise_catalog','exercise_add'], '/schedule':['schedule'],
};
export function conflictingInput(command:string, flows:readonly {flowType:string}[]):boolean {
  const allowed = INPUT_COMMANDS[command] ? ['command_input'] : EXISTING_INPUT_FLOWS[command];
  return !!allowed && flows.some((flow)=>!allowed.includes(flow.flowType));
}
export const INPUT_HINTS: Record<InputKind,string> = {
  export:'Напиши «подтверждаю экспорт» или /export_confirm. Для отмены — «❌ Отмена».',
  goal:'Напиши цель: рекомпозиция, снижение жира, набор мышц или поддержание.',
  supplement:'Напиши: Креатин | 5 г | ежедневно. Для остановки — /supplement_stop номер.',
  supplement_stop:'Напиши номер добавки, которую нужно остановить.',
  lab:'Пришли фото бланка без подписи или напиши: Гемоглобин | 150 | г/л | 130–170. Дату можно добавить пятым полем: | 2026-08-26.',
  lab_cancel:'Напиши номер ошибочной записи анализа.',
  nutrition:'Пришли скриншот дневного КБЖУ FatSecret — подпись не нужна. Фото будет передано Gemini; перед сохранением покажу черновик.',
  fatsecret:'Пришли CSV-отчёт FatSecret — подпись не нужна. Перед сохранением покажу черновик.',
};
export async function pendingCommandInput(db:D1Database,userId:number):Promise<PendingCommandInput|null> {
  return db.prepare("SELECT id,kind FROM command_input_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1")
    .bind(userId).first<PendingCommandInput>();
}
export async function startCommandInput(db:D1Database,userId:number,kind:InputKind):Promise<void> {
  const pending=await pendingCommandInput(db,userId);
  if(pending?.kind===kind)return;
  await cancelCommandInput(db,userId);
  await db.prepare('INSERT INTO command_input_conversations(user_id,kind) VALUES (?,?)').bind(userId,kind).run();
}
export async function cancelCommandInput(db:D1Database,userId:number):Promise<boolean> {
  const pending=await pendingCommandInput(db,userId); if(!pending)return false;
  await db.prepare("UPDATE command_input_conversations SET status='cancelled' WHERE user_id=? AND status='pending'").bind(userId).run();
  return true;
}
export async function completeCommandInput(db:D1Database,userId:number,id:number):Promise<void> {
  await db.prepare("UPDATE command_input_conversations SET status='completed' WHERE user_id=? AND id=? AND status='pending'").bind(userId,id).run();
}
export function routeCommandInput(kind:InputKind,text:string,media:'text'|'photo'|'document'|'voice'):string|null {
  if(media==='photo')return kind==='lab'?'/labphoto':kind==='nutrition'?'/nutrition':null;
  if(media==='document')return kind==='fatsecret'?'/fatsecret':null;
  if(media!=='text')return null;
  if(kind==='export')return text.trim().toLocaleLowerCase('ru-RU')==='подтверждаю экспорт'?'/export_confirm':null;
  if(kind==='nutrition'||kind==='fatsecret')return null;
  return `/${kind} ${text}`;
}
export function validCommandInput(kind:InputKind,text:string):boolean {
  switch(kind) {
    case 'export':return text==='/export_confirm';
    case 'goal':return parseGoalCommand(text)!==null;
    case 'supplement':return parseSupplementCommand(text)!==null || parseStopSupplementCommand(text)!==null;
    case 'supplement_stop':return parseStopSupplementCommand(text)!==null;
    case 'lab':return parseLabCommand(text)!==null || parseCancelLabCommand(text)!==null;
    case 'lab_cancel':return parseCancelLabCommand(text)!==null;
    default:return false;
  }
}
