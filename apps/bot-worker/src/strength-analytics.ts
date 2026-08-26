export interface StrengthSetRow {
  local_date: string;
  focus: string | null;
  exercise_name: string;
  reps: number;
  weight_kg: number | null;
  load_basis: string;
}

interface SessionMetric {
  date: string;
  basis: string;
  sets: number;
  totalReps: number;
  maxReps: number;
  maxWeight: number | null;
  repsAtMaxWeight: number;
}

const BASIS_LABELS: Record<string,string>={per_side:"на сторону",per_dumbbell:"на гантель",machine_display:"по шкале тренажёра",total:"общий вес",unknown:"тип веса не указан"};

function signed(value:number):string{const rounded=Math.round(value*10)/10;return`${rounded>0?"+":""}${rounded}`}

function metric(rows:StrengthSetRow[]):SessionMetric{
  const weighted=rows.filter((row)=>row.weight_kg!==null);const maxWeight=weighted.length?Math.max(...weighted.map((row)=>row.weight_kg as number)):null;
  return{date:rows[0].local_date,basis:rows[0].load_basis,sets:rows.length,totalReps:rows.reduce((sum,row)=>sum+row.reps,0),maxReps:Math.max(...rows.map((row)=>row.reps)),maxWeight,repsAtMaxWeight:maxWeight===null?0:weighted.filter((row)=>row.weight_kg===maxWeight).reduce((sum,row)=>sum+row.reps,0)};
}

function metricText(value:SessionMetric):string{
  if(value.basis==="bodyweight")return`свой вес, ${value.sets} подх., максимум ${value.maxReps}, всего ${value.totalReps} повт.`;
  if(value.maxWeight===null)return`${value.sets} подх., всего ${value.totalReps} повт., вес не указан`;
  return`${value.maxWeight} кг ${BASIS_LABELS[value.basis]??value.basis}, ${value.sets} подх., ${value.repsAtMaxWeight} повт. на максимальном весе`;
}

function comparison(current:SessionMetric,previous:SessionMetric):string{
  if(current.basis==="bodyweight")return`к ${previous.date}: максимум за подход ${signed(current.maxReps-previous.maxReps)}, всего повторений ${signed(current.totalReps-previous.totalReps)}`;
  if(current.maxWeight!==null&&previous.maxWeight!==null){const loadDelta=current.maxWeight-previous.maxWeight;if(loadDelta!==0)return`к ${previous.date}: максимальный вес ${signed(loadDelta)} кг, повторений на нём ${current.repsAtMaxWeight}`;}
  return`к ${previous.date}: всего повторений ${signed(current.totalReps-previous.totalReps)}`;
}

export function strengthTrendLines(rows:StrengthSetRow[],limit=8):string[]{
  const exercises=new Map<string,StrengthSetRow[]>();for(const row of rows){if(!Number.isFinite(row.reps)||row.reps<=0)continue;const list=exercises.get(row.exercise_name)??[];list.push(row);exercises.set(row.exercise_name,list)}
  return[...exercises.entries()].sort((a,b)=>b[1][0].local_date.localeCompare(a[1][0].local_date)).slice(0,limit).map(([name,exerciseRows])=>{
    const sessions=new Map<string,StrengthSetRow[]>();for(const row of exerciseRows){const key=`${row.local_date}|${row.load_basis}`;const list=sessions.get(key)??[];list.push(row);sessions.set(key,list)}
    const values=[...sessions.values()].map(metric).sort((a,b)=>b.date.localeCompare(a.date));const current=values[0];const previous=values.find((value,index)=>index>0&&value.basis===current.basis);
    return`• ${name}: ${current.date} — ${metricText(current)}; ${previous?comparison(current,previous):"для сравнения нужна ещё одна подтверждённая тренировка с тем же типом веса"}`;
  });
}

function performanceIndex(rows:StrengthSetRow[]):number|null{
  if(rows[0].load_basis==="bodyweight")return Math.max(...rows.map((row)=>row.reps));
  const weighted=rows.filter((row):row is StrengthSetRow&{weight_kg:number}=>row.weight_kg!==null);if(!weighted.length)return null;
  return Math.max(...weighted.map((row)=>row.weight_kg*(1+row.reps/30)));
}

export function consecutiveDecliningSessions(rows:StrengthSetRow[]):number{
  const series=new Map<string,Map<string,StrengthSetRow[]>>();for(const row of rows){if(!Number.isFinite(row.reps)||row.reps<=0)continue;const key=`${row.exercise_name}|${row.load_basis}`;const dates=series.get(key)??new Map<string,StrengthSetRow[]>();const sets=dates.get(row.local_date)??[];sets.push(row);dates.set(row.local_date,sets);series.set(key,dates)}
  const byDate=new Map<string,{declines:number;improvements:number;comparable:number}>();for(const dates of series.values()){const sessions=[...dates.entries()].sort(([a],[b])=>a.localeCompare(b));for(let index=1;index<sessions.length;index++){const previous=performanceIndex(sessions[index-1][1]);const current=performanceIndex(sessions[index][1]);if(previous===null||current===null||previous<=0)continue;const date=sessions[index][0];const signals=byDate.get(date)??{declines:0,improvements:0,comparable:0};signals.comparable+=1;const ratio=current/previous;if(ratio<=0.95)signals.declines+=1;else if(ratio>=1.05)signals.improvements+=1;byDate.set(date,signals)}}
  const evaluated=[...byDate.entries()].filter(([,signals])=>signals.comparable>=2).sort(([a],[b])=>b.localeCompare(a));let count=0;for(const[,signals]of evaluated){if(signals.declines>=2&&signals.improvements===0)count+=1;else break}return count;
}
