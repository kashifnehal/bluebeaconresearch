export function formatOperationalSummary(operationalCount: number, total: number): string {
  if (total === 0) return "No checks available";
  return `${operationalCount} of ${total} checks operational`;
}
