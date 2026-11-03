// Transactional mail for the lead-intake flow, through the same Resend account
// and verified sender the backend digest already uses (see
// apps/backend/src/services/email.service.ts) — no new provider.

import { Resend } from "resend";

const FROM = "Blue Beacon Research <digest@send.bluebeaconresearch.com>";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export type SendResult = { sent: true; id: string | null } | { sent: false; reason: string };

/** No disclaimer line, no marketing wording — this is a transactional confirmation, not a newsletter issue. */
export async function sendSubscribeConfirmation(
  email: string,
  confirmUrl: string,
  unsubscribeUrl: string,
): Promise<SendResult> {
  const client = getClient();
  if (!client) return { sent: false, reason: "no_api_key" };

  const text = `Confirm your Beacon Weekly sign-up by opening this link:\n${confirmUrl}\n\nDidn't request this? Unsubscribe: ${unsubscribeUrl}`;
  const html = `<p>Confirm your Beacon Weekly sign-up by opening this link:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p>Didn't request this? <a href="${unsubscribeUrl}">Unsubscribe</a>.</p>`;

  const res = await client.emails.send({
    from: FROM,
    to: email,
    subject: "Confirm your Beacon Weekly sign-up",
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (res.error) return { sent: false, reason: res.error.message ?? "resend_error" };
  return { sent: true, id: res.data?.id ?? null };
}

export type NewLeadNotification = {
  kind: "walkthrough" | "professional_access";
  name: string;
  workEmail: string;
  organisation: string | null;
  role: string | null;
  markets: string[];
  message: string | null;
};

/** Internal-only notification to the founder inbox. Sent only when LEADS_NOTIFY_EMAIL is set. */
export async function notifyNewLead(lead: NewLeadNotification): Promise<SendResult> {
  const notifyEmail = process.env.LEADS_NOTIFY_EMAIL;
  if (!notifyEmail) return { sent: false, reason: "not_configured" };
  const client = getClient();
  if (!client) return { sent: false, reason: "no_api_key" };

  const lines = [
    `Kind: ${lead.kind}`,
    `Name: ${lead.name}`,
    `Work email: ${lead.workEmail}`,
    `Organisation: ${lead.organisation ?? "-"}`,
    `Role: ${lead.role ?? "-"}`,
    `Markets: ${lead.markets.length > 0 ? lead.markets.join(", ") : "-"}`,
    `Message: ${lead.message ?? "-"}`,
  ];
  const text = lines.join("\n");
  const html = `<p>${lines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("</p><p>")}</p>`;

  const res = await client.emails.send({
    from: FROM,
    to: notifyEmail,
    subject: `New ${lead.kind === "professional_access" ? "professional access" : "walkthrough"} request: ${lead.name}`,
    html,
    text,
  });

  if (res.error) return { sent: false, reason: res.error.message ?? "resend_error" };
  return { sent: true, id: res.data?.id ?? null };
}
