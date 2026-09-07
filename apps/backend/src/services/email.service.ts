import { Resend } from "resend";

import { getEnv } from "../env.js";

const DEFAULT_FROM = "Blue Beacon Research <alerts@send.bluebeaconresearch.com>";

/**
 * Thin wrapper over the Resend account that already backs BBR's transactional mail
 * (verified sender domain send.bluebeaconresearch.com). Used by the #83 daily digest.
 * No new provider — just app-level API access to the existing account.
 *
 * If RESEND_API_KEY is unset the sender is inert: `send()` returns
 * { sent: false, reason: "no_api_key" } so the digest worker degrades gracefully
 * rather than throwing.
 */
export class EmailService {
  private client: Resend | null;
  readonly from: string;

  constructor() {
    const env = getEnv();
    this.client = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
    this.from = env.DIGEST_FROM_EMAIL || DEFAULT_FROM;
  }

  get enabled() {
    return this.client !== null;
  }

  async send(opts: { to: string; subject: string; html: string; text: string }) {
    if (!this.client) return { sent: false as const, reason: "no_api_key" as const };
    const res = await this.client.emails.send({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (res.error) {
      return { sent: false as const, reason: res.error.message ?? "resend_error" };
    }
    return { sent: true as const, id: res.data?.id ?? null };
  }
}
