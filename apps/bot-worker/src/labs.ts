export interface LabInput { marker:string; valueText:string; valueNumeric?:number; unit:string; reference:string; date?:string }
export function parseLabCommand(text:string):LabInput|null{
 const match=text.trim().match(/^\/lab(?:@\w+)?\s+(.+)$/i);if(!match)return null;
 const p=match[1].split("|").map((x)=>x.trim());if(p.length<4||p.length>5||p.slice(0,4).some((x)=>!x))return null;
 if(p[4]&&!/^\d{4}-\d{2}-\d{2}$/.test(p[4]))return null;
 const normalized=p[1].replace(",",".");const numeric=/^-?\d+(?:\.\d+)?$/.test(normalized)?Number(normalized):undefined;
 return{marker:p[0].slice(0,160),valueText:p[1].slice(0,80),...(numeric===undefined?{}:{valueNumeric:numeric}),unit:p[2].slice(0,40),reference:p[3].slice(0,120),date:p[4]};
}
export function parseCancelLabCommand(text:string):number|null{const m=text.trim().match(/^\/lab_cancel(?:@\w+)?\s+(\d+)$/i);return m?Number(m[1]):null}
export const LAB_HELP="Добавление: /lab Гемоглобин | 150 | г/л | 130–170\nМожно добавить дату пятым полем: | 2026-08-26\nОтмена ошибочной записи: /lab_cancel номер";
