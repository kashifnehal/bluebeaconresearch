"use client";

import { useRouter } from "next/navigation";

const C = {
  bg: "#000000",
  border: "rgba(72,72,72,0.1)",
  inputBg: "#000000",
  inputBorder: "rgba(72,72,72,0.2)",
  primary: "#4edea3",
  text: "#e7e5e4",
  muted: "#acabaa",
  surfaceHighest: "#353534",
};

export function TopBar() {
  const router = useRouter();

  return (
    <header
      style={{
        width: "100%",
        height: "64px",
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        backgroundColor: C.bg,
        borderBottom: `1px solid ${C.border}`,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Left: Search input */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "320px",
            padding: "6px 12px",
            backgroundColor: C.inputBg,
            border: `1px solid ${C.inputBorder}`,
            borderRadius: "8px",
          }}
        >
          <span style={{ fontFamily: "Material Symbols Outlined", fontSize: "16px", color: C.muted }}>search</span>
          <input
            type="text"
            placeholder="Search signals, regions, or assets..."
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: C.text,
              fontSize: "14px",
              width: "100%",
              fontFamily: "'Inter', sans-serif",
            }}
          />
          <span
            style={{
              fontSize: "10px",
              fontFamily: "'JetBrains Mono', monospace",
              color: C.muted,
              backgroundColor: C.surfaceHighest,
              padding: "1px 6px",
              borderRadius: "4px",
              flexShrink: 0,
            }}
          >
            /
          </span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        {/* Live status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.primary, display: "block" }}
            className="animate-pulse"
          />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.text }}>
            Live Network: Secure
          </span>
        </div>

        {/* Separator */}
        <div style={{ width: "1px", height: "20px", backgroundColor: "rgba(72,72,72,0.3)" }} />

        {/* Icons */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
          >
            <span style={{ fontFamily: "Material Symbols Outlined", fontSize: "22px" }}>notifications</span>
          </button>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
          >
            <span style={{ fontFamily: "Material Symbols Outlined", fontSize: "22px" }}>help</span>
          </button>
        </div>

        {/* Separator */}
        <div style={{ width: "1px", height: "20px", backgroundColor: "rgba(72,72,72,0.3)" }} />

        {/* User info + avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: C.text, margin: 0 }}>Terminal Sentinel</p>
            <p style={{ fontSize: "10px", color: C.primary, margin: 0, fontWeight: 700, letterSpacing: "0.05em" }}>
              LVL 4 ACCESS
            </p>
          </div>
          <button
            onClick={() => router.push("/settings")}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: C.primary,
              border: `1px solid #6ffbbe`,
              color: "#003824",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            GS
          </button>
        </div>
      </div>
    </header>
  );
}
