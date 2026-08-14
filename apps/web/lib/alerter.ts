const WEBHOOK = process.env.ALERT_WEBHOOK_URL;

export async function sendAlert(payload: any) {
  if (!WEBHOOK) {
    // No webhook configured — log to server console
    // eslint-disable-next-line no-console
    console.warn("[alerter] alert (no webhook):", JSON.stringify(payload));
    return;
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3_000);
    // use global fetch available in Node 18+/Next.js runtimes
    // @ts-ignore
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(id);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[alerter] failed to send alert:", e?.message ?? e);
  }
}

export default { sendAlert };
