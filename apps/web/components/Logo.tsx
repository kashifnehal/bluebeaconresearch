"use client";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const textSize = size === "sm" ? "text-[18px]" : "text-[22px]";
  return (
    <div className={`flex items-center justify-center gap-2 ${textSize} font-semibold text-text-primary`}>
      <span className="text-accent">●</span>
      <span>GeoSignal</span>
    </div>
  );
}

