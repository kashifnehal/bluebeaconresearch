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
      <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_rgba(78,222,163,0.5)]" />
      <span>GEOSIGNAL</span>
    </div>
  );
}


