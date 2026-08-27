import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildNutritionSql, parseFatSecretCsv } from "./fatsecret-csv.mjs";

const [inputPath,outputPath,userText="1"]=process.argv.slice(2);if(!inputPath||!outputPath)throw new Error("Использование: node import-fatsecret.mjs <FatSecret.csv> <draft.sql> [user_id]");const text=await readFile(resolve(inputPath),"utf8");const parsed=parseFatSecretCsv(text);await writeFile(resolve(outputPath),buildNutritionSql(parsed,Number(userText)),{flag:"wx"});process.stdout.write(`Подготовлен черновик: ${parsed.days.length} дней, ${parsed.days[0].date} — ${parsed.days.at(-1).date}. Продукты не сохраняются.\n`);
