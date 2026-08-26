import type{D1Database}from"./db.ts";import type{LabInput}from"./labs.ts";
interface LabRow{id:number;collected_on:string;marker_name:string;value_text:string;unit:string;reference_text:string}
export async function addLabResult(db:D1Database,userId:number,input:LabInput,defaultDate:string):Promise<void>{await db.prepare(`INSERT INTO lab_results(user_id,collected_on,marker_name,value_text,value_numeric,unit,reference_text,source,status)
 VALUES(?,?,?,?,?,?,?,'telegram_manual','active')`).bind(userId,input.date??defaultDate,input.marker,input.valueText,input.valueNumeric??null,input.unit,input.reference).run()}
export async function listLabResults(db:D1Database,userId:number):Promise<LabRow[]>{const r=await db.prepare(`SELECT id,collected_on,marker_name,value_text,unit,reference_text FROM lab_results
 WHERE user_id=? AND status='active' ORDER BY collected_on DESC,id DESC LIMIT 20`).bind(userId).all<LabRow>();return r.results??[]}
export async function cancelLabResult(db:D1Database,userId:number,id:number):Promise<boolean>{const row=await db.prepare("SELECT id FROM lab_results WHERE id=? AND user_id=? AND status='active'").bind(id,userId).first<{id:number}>();if(!row)return false;await db.prepare("UPDATE lab_results SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,userId).run();return true}
