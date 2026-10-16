export function formatOperationalSummary(operationalCount: number, total: number): string {
  if (total === 0) return "No checks available";
  return `${operationalCount} of ${total} checks operational`;
}

/** Public /status labels. Internal check names stay on the check object. */
const PUBLIC_STATUS_NAMES: Record<string, string> = {
  "Alert Delivery": "Alerts",
  "Price History": "Prices",
};

export function publicStatusName(internalName: string): string {
  return PUBLIC_STATUS_NAMES[internalName] ?? internalName;
}
