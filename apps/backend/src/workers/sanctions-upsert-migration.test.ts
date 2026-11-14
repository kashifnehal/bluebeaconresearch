import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let failed = false;
async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

function newestUpsertSanctionsEntitiesMigration(migrationsDir: string): string {
  const candidates = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(migrationsDir, f), "utf8").includes("function public.upsert_sanctions_entities("))
    .sort();
  const file = candidates[candidates.length - 1];
  assert.ok(file, "expected a migration file that defines public.upsert_sanctions_entities");
  return file as string;
}

await runTest("the newest upsert_sanctions_entities migration skips unchanged rows before the insert", async () => {
  const here = fileURLToPath(import.meta.url);
  const migrationsDir = join(here, "..", "..", "..", "..", "..", "supabase", "migrations");
  const file = newestUpsertSanctionsEntitiesMigration(migrationsDir);
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const notExistsCount = Array.from(sql.matchAll(/where not exists \(/g)).length;
  assert.equal(notExistsCount, 1, `expected exactly one "where not exists (" in ${file}`);
  assert.ok(
    sql.includes("on conflict (name, list) do update"),
    `expected "on conflict (name, list) do update" in ${file}`,
  );
  assert.ok(sql.includes("is not distinct from i.raw_data"), `expected "is not distinct from i.raw_data" in ${file}`);
});

if (failed) process.exitCode = 1;
