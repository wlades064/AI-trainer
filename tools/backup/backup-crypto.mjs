import { constants as fsConstants } from "node:fs";
import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("AITRBKP1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 16) {
    throw new Error("Пароль резервной копии должен содержать не менее 16 символов");
  }
}

function assertDifferentPaths(inputPath, outputPath) {
  if (resolve(inputPath) === resolve(outputPath)) throw new Error("Входной и выходной файлы должны различаться");
}

async function writeExclusive(outputPath, data) {
  const temporaryPath = `${outputPath}.partial-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, data, { flag: "wx", mode: 0o600 });
    await copyFile(temporaryPath, outputPath, fsConstants.COPYFILE_EXCL);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function encryptFile(inputPath, outputPath, passphrase) {
  assertPassphrase(passphrase);
  assertDifferentPaths(inputPath, outputPath);
  const plaintext = await readFile(inputPath);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.concat([MAGIC, salt, iv]));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeExclusive(outputPath, Buffer.concat([MAGIC, salt, iv, tag, ciphertext]));
}

export async function decryptFile(inputPath, outputPath, passphrase) {
  assertPassphrase(passphrase);
  assertDifferentPaths(inputPath, outputPath);
  const payload = await readFile(inputPath);
  if (payload.length < HEADER_BYTES || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Файл не является резервной копией AI-тренера");
  }
  let offset = MAGIC.length;
  const salt = payload.subarray(offset, offset += SALT_BYTES);
  const iv = payload.subarray(offset, offset += IV_BYTES);
  const tag = payload.subarray(offset, offset += TAG_BYTES);
  const ciphertext = payload.subarray(offset);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.concat([MAGIC, salt, iv]));
  decipher.setAuthTag(tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Неверный пароль или резервная копия повреждена");
  }
  await writeExclusive(outputPath, plaintext);
}

async function main() {
  const [operation, inputPath, outputPath] = process.argv.slice(2);
  if (!operation || !inputPath || !outputPath || !["encrypt", "decrypt"].includes(operation)) {
    throw new Error("Использование: node backup-crypto.mjs <encrypt|decrypt> <input> <output>");
  }
  const passphrase = process.env.AI_TRAINER_BACKUP_PASSPHRASE;
  assertPassphrase(passphrase);
  if (operation === "encrypt") await encryptFile(inputPath, outputPath, passphrase);
  else await decryptFile(inputPath, outputPath, passphrase);
  process.stdout.write(`${operation === "encrypt" ? "Создана" : "Восстановлена"} копия: ${basename(outputPath)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Неизвестная ошибка"}\n`);
    process.exitCode = 1;
  });
}
