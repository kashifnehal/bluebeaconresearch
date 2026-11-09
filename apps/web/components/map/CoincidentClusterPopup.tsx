import { safeFormatDistanceToNow } from "@/lib/utils";

export type CoincidentClusterSignal = {
  id: string;
  title: string;
  severity: number;
  eventDate?: string | null;
  createdAt: string;
};

export function CoincidentClusterPopup({
  signals,
  onClose,
}: {
  signals: readonly CoincidentClusterSignal[];
  onClose: () => void;
}) {
  return (
    <div
      data-testid="coincident-cluster-popup"
      role="dialog"
      aria-label="Events at this point"
      className="absolute top-16 left-1/2 z-40 w-72 -translate-x-1/2 rounded-lg border border-outline-variant/40 bg-black/80 p-3 text-on-surface backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium">Events at this point</span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[12px]">
          Close
        </button>
      </div>
      <ul className="space-y-2">
        {signals.map((signal) => (
          <li key={signal.id} className="text-[12px] leading-snug">
            <a href={`/events/${signal.id}`} className="font-medium text-primary">
              {signal.title}
            </a>
            <div className="text-on-surface-variant">
              Severity {signal.severity} · {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt)} ago
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
