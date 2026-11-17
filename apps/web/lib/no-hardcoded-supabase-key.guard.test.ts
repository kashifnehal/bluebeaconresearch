// Repo-wide guard (TASK HEALTH-1 Part 3): signal-count-cache.ts's old anon-key
// fallback meant a compiled build could end up with a literal Supabase anon
// JWT baked in (NEXT_PUBLIC_* env vars are inlined by the bundler), which
// showed up inside Vercel error titles. Fails the test chain if any source
// file outside tests contains a string starting with "eyJ" — JWTs always
// start with this (base64 of `{"`) — so a key can never be hardcoded again;
// it must come from process.env instead.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(dir, "..");
const SCOPE_ROOTS = ["app", "components", "lib"];
const JWT_PREFIX_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}/;

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runTest("no apps/web source file outside tests contains a hardcoded JWT (a string starting with eyJ)", () => {
  const files = SCOPE_ROOTS.flatMap((root) => walk(path.join(webRoot, root)));
  assert.ok(files.length > 50, "expected to find many in-scope source files");

  const violations: string[] = [];
  for (const file of files) {
    const relFile = path.relative(webRoot, file).split(path.sep).join("/");
    const source = readFileSync(file, "utf8");
    if (JWT_PREFIX_PATTERN.test(source)) violations.push(relFile);
  }

  assert.deepEqual(violations, [], `unexpected hardcoded JWT-looking literal in:\n${violations.join("\n")}`);
});

runTest("the guard's own pattern actually catches a real JWT-shaped literal", () => {
  const fakeAnonJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";
  assert.ok(JWT_PREFIX_PATTERN.test(`const key = "${fakeAnonJwt}";`));
});
