import { getEnv } from "../env.js";

let warnedUnconfigured = false;

/**
 * Manual early-access gate for #111 chat — NOT a billing system.
 * Replace this with real plan-tier / #84 billing once that ships.
 * Unset or empty CHAT_ALLOWED_EMAILS => nobody is allowed (fail closed).
 */
export function chatAllowedEmails(): string[] {
  return (getEnv().CHAT_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isChatAllowedEmail(email: string | null | undefined): boolean {
  const allow = chatAllowedEmails();
  if (allow.length === 0) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[signal-chat] CHAT_ALLOWED_EMAILS is unset or empty — blocking all chat (fail closed)",
      );
    }
    return false;
  }
  if (!email) return false;
  return allow.includes(email.trim().toLowerCase());
}
