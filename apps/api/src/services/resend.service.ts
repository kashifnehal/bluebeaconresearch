import { Resend } from "resend";

import { getEnv } from "../env";

export class ResendService {
  private client: Resend | null = null;

  private getClient() {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.RESEND_API_KEY) return null;
    this.client = new Resend(env.RESEND_API_KEY);
    return this.client;
  }

  async sendAlertEmail(to: string, subject: string, html: string) {
    const env = getEnv();
    const client = this.getClient();
    if (!client || !env.RESEND_FROM_EMAIL) return { ok: false as const, reason: "Missing Resend config" as const };

    const res = await client.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    });
    return { ok: true as const, result: res };
  }
}

