import type { ReactNode } from "react";

export type PageShellWidth = "wide" | "medium" | "narrow";

const WIDTH_CLASS: Record<PageShellWidth, string> = {
  wide: "max-w-[1440px]",
  medium: "max-w-4xl",
  narrow: "max-w-3xl",
};

export function PageShell({
  width = "wide",
  aside,
  className = "",
  children,
}: {
  width?: PageShellWidth;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="page-shell"
      className={`w-full pt-16 bg-surface-container-lowest text-on-surface ${aside ? "flex" : ""} ${className}`}
    >
      <div className={`min-w-0 flex-1 mx-auto w-full px-4 py-4 md:p-8 ${WIDTH_CLASS[width]}`}>
        {children}
      </div>
      {aside}
    </div>
  );
}
