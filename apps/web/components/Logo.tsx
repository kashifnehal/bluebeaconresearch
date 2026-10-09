import { cn } from "@/lib/utils";

/**
 * variant "full" (default): icon + "BLUE BEACON RESEARCH" wordmark — for standalone
 * placements with no brand name nearby (homepage header, auth cards).
 * variant "icon": mark only — for spots that already render the brand name as text
 * next to it (PublicHeader, homepage footer, Sidebar), so the name isn't duplicated.
 */
export function Logo({ className, variant = "full" }: { className?: string; variant?: "full" | "icon" }) {
  if (variant === "icon") {
    return (
      <img
        src="/brand/mark-white.png"
        alt="Blue Beacon Research"
        className={cn("w-auto select-none", className)}
      />
    );
  }

  return (
    <img
      src="/brand/lockup-white.png"
      alt="Blue Beacon Research"
      className={cn("w-auto select-none", className)}
    />
  );
}
