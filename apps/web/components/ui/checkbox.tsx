export function Checkbox({
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
    <label
      className={`flex items-center gap-3 min-h-[44px] md:min-h-[24px] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <input
        id={id}
        type="checkbox"
        data-testid={dataTestId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)] w-4 h-4 shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none"
      />
      <span className={hideLabel ? "sr-only" : "min-w-0"}>
        <span className="block text-[13px] text-on-surface">{label}</span>
        {description && !hideLabel ? (
          <span className="block text-[12px] text-on-surface/60">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
