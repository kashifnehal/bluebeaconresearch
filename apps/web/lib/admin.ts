// Founder-internal admin identity. `profiles` has no `role` column (checked
// 2026-09-04 — plan_tier only), so admin access is an email allowlist in the
// ADMIN_EMAILS env var (comma-separated). Unset => nobody is admin (fail closed).
// The backend enforces the same var independently — see
// apps/backend/src/routes/admin.ts.

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
