"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type NavItem = { href: string; label: string; icon: string; badge?: number };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "INTELLIGENCE FEED", icon: "rss_feed" },
  { href: "/map", label: "GLOBAL MAP", icon: "public" },
  { href: "/alerts", label: "ALERTS", icon: "notifications_active", badge: 12 },
  { href: "/watchlist", label: "WATCHLIST", icon: "visibility" },
  { href: "/backtesting", label: "BACKTESTING", icon: "history" },
  { href: "/settings", label: "SETTINGS", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-50"
      style={{
        width: "256px",
        backgroundColor: "#000000",
        borderRight: "1px solid #3c4a42",
      }}
    >
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <span className="font-headline font-bold text-sm tracking-tighter text-on-surface text-white">
            Blue Beacon Research
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 border"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              borderColor: "#4edea3",
              color: "#4edea3",
            }}
          >
            ALPHA
          </span>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 relative"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "12px",
                  letterSpacing: "0.05em",
                  color: active ? "#4edea3" : "rgba(229,226,225,0.6)",
                  borderLeft: active ? "2px solid #4edea3" : "2px solid transparent",
                  backgroundColor: active ? "#131313" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "#e5e2e1";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#131313";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "rgba(229,226,225,0.6)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "18px" }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className="ml-auto text-[8px] font-bold px-1.5 py-0.5"
                    style={{
                      backgroundColor: "#7f2927",
                      color: "#ff9993",
                      borderRadius: "9999px",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div
        className="mt-auto p-6 border-t space-y-2"
        style={{ borderColor: "#3c4a42", backgroundColor: "#0e0e0e" }}
      >
        <div className="text-[10px] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#4edea3" }}>
          Node: GS-ALPHA-09
        </div>
        <a
          href="#"
          className="flex items-center gap-2 transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", color: "rgba(229,226,225,0.6)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e5e2e1"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(229,226,225,0.6)"; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>help</span>
          Help
        </a>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full text-left transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", color: "rgba(229,226,225,0.6)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ffb4ab"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(229,226,225,0.6)"; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
