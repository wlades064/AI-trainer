import type {D1Database} from "./db.ts";import type{SupplementInput}from"./supplements.ts";
interface SupplementRow{id:number;name:string;dose_value:number;dose_unit:string;schedule_text:string;starts_on:string}
export async function addSupplement(db:D1Database,userId:number,input:SupplementInput,date:string):Promise<void>{
 await db.prepare(`INSERT INTO supplements(user_id,name,dose_value,dose_unit,schedule_text,starts_on,status,source)
 VALUES(?,?,?,?,?,?,'active','telegram')`).bind(userId,input.name,input.doseValue,input.doseUnit,input.schedule,date).run();
}
export async function stopSupplement(db:D1Database,userId:number,id:number,date:string):Promise<boolean>{
 const row=await db.prepare("SELECT id FROM supplements WHERE id=? AND user_id=? AND status='active'").bind(id,userId).first<{id:number}>();if(!row)return false;
 await db.prepare("UPDATE supplements SET status='stopped',ends_on=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(date,id,userId).run();return true;
}
export async function listSupplements(db:D1Database,userId:number):Promise<SupplementRow[]>{
 const result=await db.prepare(`SELECT id,name,dose_value,dose_unit,schedule_text,starts_on FROM supplements
 WHERE user_id=? AND status='active' ORDER BY name`).bind(userId).all<SupplementRow>();return result.results??[];
}
export async function compactSupplements(db:D1Database,userId:number):Promise<string>{
 const rows=await listSupplements(db,userId);return rows.length?rows.map((r)=>`${r.name}: ${r.dose_value} ${r.dose_unit}, ${r.schedule_text}`).join("; "):"нет активных данных";
}
