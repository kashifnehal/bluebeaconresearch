import assert from "node:assert/strict";

import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import {
  classifyAuthFailure,
  decideAuthAction,
  hasSupabaseAuthCookie,
  runAuthCheck,
} from "./proxy";

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function reqWithCookies(cookieHeader: string | null) {
  return new NextRequest("https://app.example.com/dashboard", {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

const fakeUser = { id: "u1" } as const;

async function main() {
  // ── classifyAuthFailure: definite no-session ─────────────────────────────

  await runTest("AuthSessionMissingError classifies as no-session", () => {
    assert.equal(classifyAuthFailure(new AuthSessionMissingError()), "no-session");
  });

  await runTest("AuthApiError 401 classifies as no-session", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("invalid token", 401, "bad_jwt")),
      "no-session",
    );
  });

  await runTest("AuthApiError 403 classifies as no-session", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("forbidden", 403, undefined)),
      "no-session",
    );
  });

  await runTest("AuthApiError with code bad_jwt classifies as no-session regardless of status", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("bad jwt", 400, "bad_jwt")),
      "no-session",
    );
  });

  await runTest("AuthApiError with code session_not_found classifies as no-session", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("session gone", 400, "session_not_found")),
      "no-session",
    );
  });

  // ── classifyAuthFailure: retryable ────────────────────────────────────────

  await runTest("AuthApiError 500 classifies as retryable", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("internal error", 500, undefined)),
      "retryable",
    );
  });

  await runTest("AuthApiError 429 classifies as retryable", () => {
    assert.equal(
      classifyAuthFailure(new AuthApiError("rate limited", 429, undefined)),
      "retryable",
    );
  });

  await runTest("AuthApiError 409 (concurrent token refresh) classifies as retryable", () => {
    assert.equal(
      classifyAuthFailure(
        new AuthApiError("too many concurrent token refresh requests", 409, undefined),
      ),
      "retryable",
    );
  });

  await runTest("AuthRetryableFetchError classifies as retryable", () => {
    assert.equal(
      classifyAuthFailure(new AuthRetryableFetchError("fetch failed", 0)),
      "retryable",
    );
  });

  await runTest("an unrecognized/unwrapped error fails open to retryable, not closed", () => {
    assert.equal(classifyAuthFailure(new TypeError("network error")), "retryable");
  });

  // ── hasSupabaseAuthCookie ─────────────────────────────────────────────────

  await runTest("detects the default sb-<ref>-auth-token cookie", () => {
    assert.equal(hasSupabaseAuthCookie(reqWithCookies("sb-abcprojectref-auth-token=xyz")), true);
  });

  await runTest("detects a chunked sb-<ref>-auth-token.0 cookie", () => {
    assert.equal(
      hasSupabaseAuthCookie(
        reqWithCookies("sb-abcprojectref-auth-token.0=xyz; sb-abcprojectref-auth-token.1=abc"),
      ),
      true,
    );
  });

  await runTest("returns false with no cookies at all", () => {
    assert.equal(hasSupabaseAuthCookie(reqWithCookies(null)), false);
  });

  await runTest("returns false with unrelated cookies only", () => {
    assert.equal(hasSupabaseAuthCookie(reqWithCookies("theme=dark; other=1")), false);
  });

  // ── runAuthCheck: the three classes ──────────────────────────────────────

  await runTest("runAuthCheck resolves ok when getUser() succeeds with a user", async () => {
    const { outcome, user } = await runAuthCheck(
      Promise.resolve({ data: { user: fakeUser }, error: null } as any),
    );
    assert.equal(outcome, "ok");
    assert.equal(user, fakeUser);
  });

  await runTest("runAuthCheck classifies a definite no-session rejection", async () => {
    const { outcome, user } = await runAuthCheck(
      Promise.reject(new AuthSessionMissingError()) as any,
    );
    assert.equal(outcome, "no-session");
    assert.equal(user, null);
  });

  await runTest("runAuthCheck classifies a retryable rejection (e.g. 504/409)", async () => {
    const { outcome, user } = await runAuthCheck(
      Promise.reject(new AuthRetryableFetchError("gateway timeout", 504)) as any,
    );
    assert.equal(outcome, "retryable");
    assert.equal(user, null);
  });

  await runTest("runAuthCheck treats a hung getUser() call as retryable (timeout)", async () => {
    // Never resolves within the test's lifetime; runAuthCheck must still
    // return promptly once its own short timeout elapses.
    const hungPromise = new Promise<any>(() => {});
    const { outcome, user } = await runAuthCheck(hungPromise, 25);
    assert.equal(outcome, "retryable");
    assert.equal(user, null);
  });

  // ── decideAuthAction: the full with/without-cookie matrix ───────────────

  await runTest("ok always allows, regardless of cookie presence", () => {
    assert.equal(decideAuthAction("ok", true), "allow");
    assert.equal(decideAuthAction("ok", false), "allow");
  });

  await runTest("no-session always redirects, regardless of cookie presence", () => {
    assert.equal(decideAuthAction("no-session", true), "redirect");
    assert.equal(decideAuthAction("no-session", false), "redirect");
  });

  await runTest("retryable with an auth cookie present falls open (degraded)", () => {
    assert.equal(decideAuthAction("retryable", true), "allow-degraded");
  });

  await runTest("retryable with no auth cookie redirects (nothing to fail open to)", () => {
    assert.equal(decideAuthAction("retryable", false), "redirect");
  });
}

main();
