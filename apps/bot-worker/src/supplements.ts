export interface SupplementInput { name: string; doseValue: number; doseUnit: string; schedule: string }

export function parseSupplementCommand(text: string): SupplementInput | null {
  const match=text.trim().match(/^\/supplement(?:@\w+)?\s+(.+)$/i); if(!match)return null;
  const parts=match[1].split("|").map((p)=>p.trim()); if(parts.length!==3)return null;
  const dose=parts[1].replace(",",".").match(/^(\d+(?:\.\d{1,3})?)\s*([\p{L}%]+)$/u);
  if(!dose||!parts[0]||!parts[2])return null;
  const value=Number(dose[1]); if(!Number.isFinite(value)||value<=0||value>100000)return null;
  return {name:parts[0].slice(0,120),doseValue:value,doseUnit:dose[2].slice(0,20),schedule:parts[2].slice(0,200)};
}

export function parseStopSupplementCommand(text:string):number|null{
  const match=text.trim().match(/^\/supplement_stop(?:@\w+)?\s+(\d+)$/i);return match?Number(match[1]):null;
}

export const SUPPLEMENT_HELP="Добавление: /supplement Креатин | 5 г | ежедневно\nОстановка: /supplement_stop номер";
