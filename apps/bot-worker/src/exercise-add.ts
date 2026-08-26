import type{CatalogGroup}from"./exercise-catalog.ts";
export type EquipmentCategory="machine"|"attachment"|"free_weight"|"bodyweight"|"other";
export type WorkoutRole="main"|"accessory";
const SUBGROUPS:Record<CatalogGroup,Record<string,string>>={chest:{грудь:"chest"},back:{спина:"back",трапеция:"traps"},legs:{общая:"legs",квадрицепс:"quadriceps","задняя поверхность":"hamstrings",икры:"calves",ягодицы:"glutes",приводящие:"adductors"},shoulders:{общая:"shoulders",передняя:"front_delts",средняя:"middle_delts",задняя:"rear_delts"},biceps:{бицепс:"biceps"},triceps:{трицепс:"triceps"}};
const EQUIPMENT:Record<string,EquipmentCategory>={тренажер:"machine",рукоять:"attachment","свободный вес":"free_weight","свой вес":"bodyweight",другое:"other"};
const RISKS:Record<string,string>={"коленная нагрузка":"knee_load","глубокое сгибание колена":"deep_knee_flexion",голеностоп:"ankle_load","стабильность голеностопа":"ankle_stability",баланс:"balance","осевая нагрузка":"axial_load",поясница:"lower_back_load","растяжение задней поверхности":"hamstring_stretch",одностороннее:"unilateral"};
export function subgroupOptions(group:CatalogGroup):string[]{return Object.keys(SUBGROUPS[group])}
export function parseSubgroup(group:CatalogGroup,text:string):string|null{return SUBGROUPS[group][text.trim().toLocaleLowerCase("ru-RU")]??null}
export function parseEquipmentCategory(text:string):EquipmentCategory|null{return EQUIPMENT[text.trim().toLocaleLowerCase("ru-RU")]??null}
export function parseWorkoutRole(text:string):WorkoutRole|null{const value=text.trim().toLocaleLowerCase("ru-RU");if(value==="основное")return"main";if(value==="добавочное")return"accessory";return null}
export function parseRiskTags(text:string):string[]|null{const value=text.trim().toLocaleLowerCase("ru-RU");if(value==="нет")return[];const parts=value.split(",").map((item)=>item.trim()).filter(Boolean);if(!parts.length||parts.some((part)=>!RISKS[part]))return null;return[...new Set(parts.map((part)=>RISKS[part]))]}
export const EQUIPMENT_QUESTION="Тип оборудования: тренажер, рукоять, свободный вес, свой вес или другое.";
export const RISKS_QUESTION="Риски через запятую либо «нет»: коленная нагрузка, глубокое сгибание колена, голеностоп, стабильность голеностопа, баланс, осевая нагрузка, поясница, растяжение задней поверхности, одностороннее.";
