import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decryptFile, encryptFile } from "./backup-crypto.mjs";

const PASSPHRASE = "test-only-passphrase-32-characters";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "ai-trainer-backup-test-"));
  const input = join(directory, "source.sqlite3");
  const encrypted = join(directory, "source.aitbackup");
  const restored = join(directory, "restored.sqlite3");
  await writeFile(input, Buffer.from("SQLite fixture without personal data"));
  return { directory, input, encrypted, restored };
}

test("encrypted backup restores the exact original bytes", async () => {
  const files = await fixture();
  try {
    await encryptFile(files.input, files.encrypted, PASSPHRASE);
    assert.notDeepEqual(await readFile(files.encrypted), await readFile(files.input));
    await decryptFile(files.encrypted, files.restored, PASSPHRASE);
    assert.deepEqual(await readFile(files.restored), await readFile(files.input));
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("wrong password does not produce a restored file", async () => {
  const files = await fixture();
  try {
    await encryptFile(files.input, files.encrypted, PASSPHRASE);
    await assert.rejects(() => decryptFile(files.encrypted, files.restored, "wrong-password-long-enough"), /Неверный пароль/);
    await assert.rejects(() => readFile(files.restored), { code: "ENOENT" });
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("backup creation never overwrites an existing file", async () => {
  const files = await fixture();
  try {
    await writeFile(files.encrypted, "keep me");
    await assert.rejects(() => encryptFile(files.input, files.encrypted, PASSPHRASE), { code: "EEXIST" });
    assert.equal(await readFile(files.encrypted, "utf8"), "keep me");
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});
