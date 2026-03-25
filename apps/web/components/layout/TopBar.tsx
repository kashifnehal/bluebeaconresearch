"use client";

import { useRouter } from "next/navigation";

export function TopBar() {
  const router = useRouter();

  return (
    <header
      className="fixed top-0 right-0 z-40 flex items-center justify-between px-6"
      style={{
        left: "256px",
        height: "64px",
        backgroundColor: "#000000",
        borderBottom: "1px solid #2a2a2a",
      }}
    >
      {/* Left: Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2"
            style={{ fontSize: "16px", color: "#86948a" }}
          >
            search
          </span>
          <input
            className="w-full border-none border-b focus:ring-0 text-xs py-2 pl-10 pr-4"
            style={{
              backgroundColor: "#0e0e0e",
              borderBottom: "1px solid #3c4a42",
              color: "#e5e2e1",
              fontFamily: "'JetBrains Mono', monospace",
              outline: "none",
            }}
            placeholder="Search signals, coordinates, entities..."
            type="text"
          />
        </div>
      </div>

      {/* Right: Icons + User */}
      <div className="flex items-center gap-6">
        <div className="flex gap-4">
          <button
            className="transition-colors"
            style={{ color: "#bbcac0", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4edea3"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#bbcac0"; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>notifications</span>
          </button>
          <button
            className="transition-colors"
            style={{ color: "#bbcac0", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4edea3"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#bbcac0"; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>help</span>
          </button>
        </div>

        <div style={{ width: "1px", height: "32px", backgroundColor: "#3c4a42" }} />

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div
              style={{ fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", color: "#4edea3", letterSpacing: "0.05em" }}
            >
              Terminal Sentinel
            </div>
            <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>
              v2.4.0-STABLE
            </div>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center justify-center font-bold border"
            style={{
              width: "32px",
              height: "32px",
              fontSize: "10px",
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: "#2a2a2a",
              borderColor: "#3c4a42",
              color: "#4edea3",
              cursor: "pointer",
            }}
          >
            GS
          </button>
        </div>
      </div>
    </header>
  );
}
