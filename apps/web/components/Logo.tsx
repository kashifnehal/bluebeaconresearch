"use client";

import { cn } from "@/lib/utils";

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "text-[16px] gap-1.5",
    md: "text-[20px] gap-2",
    lg: "text-[24px] gap-3"
  };

  return (
    <div className={cn("flex items-center font-black tracking-tighter text-text-primary", sizeClasses[size], className)} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="flex items-center gap-0.5 select-none scale-90 origin-left">
        <span className="text-primary font-black tracking-[-0.05em] text-xl">BLUE</span>
        <span className="text-on-surface font-black tracking-[-0.05em] text-xl">BEACON</span>
        <span className="text-on-surface/40 font-black tracking-[-0.05em] text-xl ml-1">RESEARCH</span>
      </div>
    </div>
  );
}
