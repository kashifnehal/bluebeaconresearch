"use client";

import { useRouter } from "next/navigation";

export function TopBar() {
  const router = useRouter();

  return (
    <header
      className="w-full h-16 sticky top-0 z-40 flex items-center justify-between px-6 font-['Inter'] antialiased tracking-tight"
      style={{ backgroundColor: "#0e0e0e", borderBottom: "1px solid rgba(72,72,72,0.1)" }}
    >
      {/* Left: Search */}
      <div className="flex items-center gap-8">
        <div className="hidden md:flex items-center bg-surface-container-lowest rounded-lg px-3 py-1.5 gap-2 w-80 border border-outline-variant/20 relative">
          <span className="material-symbols-outlined text-on-surface-variant text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>search</span>
          <input
            className="bg-transparent border-none focus:ring-0 text-sm w-full text-on-surface placeholder:text-on-surface-variant/50 outline-none"
            placeholder="Search signals, regions, or assets..."
            type="text"
          />
          <span className="text-[10px] bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface-variant font-mono">/</span>
        </div>
      </div>

      {/* Right: Status + Actions + Avatar */}
      <div className="flex items-center gap-5">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#4edea3" }} />
          <span className="text-[10px] font-bold tracking-tighter uppercase" style={{ color: "#e7e5e4" }}>Live Network: Secure</span>
        </div>
        <div className="flex items-center gap-4 mr-2">
          <button className="text-on-surface-variant hover:text-white transition-colors duration-200">
            <span className="material-symbols-outlined" style={{ fontFamily: "Material Symbols Outlined" }}>notifications</span>
          </button>
          <button className="text-on-surface-variant hover:text-white transition-colors duration-200">
            <span className="material-symbols-outlined" style={{ fontFamily: "Material Symbols Outlined" }}>help</span>
          </button>
        </div>
        <div className="flex items-center gap-3 pl-4" style={{ borderLeft: "1px solid rgba(72,72,72,0.2)" }}>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-on-surface">Terminal Sentinel</p>
            <p className="text-[10px]" style={{ color: "#4edea3" }}>LVL 4 ACCESS</p>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="w-8 h-8 rounded-full border overflow-hidden flex items-center justify-center text-xs font-bold text-on-primary"
            style={{ backgroundColor: "#4edea3", borderColor: "rgba(78,222,163,0.3)", color: "#004a31" }}
          >
            GS
          </button>
        </div>
      </div>
    </header>
  );
}
