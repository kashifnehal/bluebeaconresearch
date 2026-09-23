"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";

type TabItem = { href: string; label: string; icon: string; showBadge?: boolean };

const TABS: TabItem[] = [
  { href: "/dashboard", label: "Feed", icon: "rss_feed" },
  { href: "/map", label: "Map", icon: "public" },
  { href: "/alerts", label: "Alerts", icon: "notifications_active", showBadge: true },
  { href: "/watchlist", label: "Watchlist", icon: "visibility" },
];

// Mobile-only bottom navigation (md:hidden). Reuses the same routes and
// Material Symbols icon names as Sidebar's NAV so mobile and desktop share
// iconography. MORE opens the existing off-canvas drawer (useUIStore's
// mobileSidebarOpen) instead of duplicating a second nav surface — Calendar,
// Backtesting, Settings, Help and Logout all already live there.
export function MobileTabBar() {
  const pathname = usePathname();
  const { unreadCount, setMobileSidebarOpen } = useUIStore();

  return (
    <nav
      aria-label="Primary navigation (mobile)"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        height: "60px",
        backgroundColor: "#000000",
        borderTop: "1px solid #2a2a2a",
      }}
    >
      {TABS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative min-h-[44px]"
            style={{ color: active ? "#4edea3" : "#86948a" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              {item.icon}
            </span>
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {item.label}
            </span>
            {item.showBadge && unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-[calc(50%-18px)] text-[9px] font-bold px-1 min-w-[14px] text-center"
                style={{
                  backgroundColor: "#7f2927",
                  color: "#ff9993",
                  borderRadius: "9999px",
                }}
              >
                {unreadCount}
              </span>
            )}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open more navigation"
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
        style={{ color: "#86948a", background: "none", border: "none", cursor: "pointer" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
          menu
        </span>
        <span
          className="text-[10px] uppercase tracking-wide"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          More
        </span>
      </button>
    </nav>
  );
}
