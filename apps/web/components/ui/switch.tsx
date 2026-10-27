export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
  hideLabel,
  id,
  "data-testid": dataTestId,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  id?: string;
  "data-testid"?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[44px] md:min-h-[24px]">
      <span className={hideLabel ? "sr-only" : "min-w-0"}>
        <span className="block text-[13px] text-on-surface">{label}</span>
        {description && !hideLabel ? (
          <span className="block text-[12px] text-on-surface/60">{description}</span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        data-testid={dataTestId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 w-10 h-6 rounded-full border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none"
        style={{
          backgroundColor: checked ? "var(--accent)" : "var(--bg-container)",
          borderColor: checked ? "var(--accent)" : "var(--border)",
        }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
