/** Discord incoming-webhook URLs only — rejects anything else (SSRF). */
export const DISCORD_WEBHOOK_URL_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+(?:\?.*)?$/;

export function isDiscordWebhookUrl(value: string): boolean {
  return DISCORD_WEBHOOK_URL_RE.test(value.trim());
}
