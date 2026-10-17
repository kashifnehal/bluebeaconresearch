"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOutAndRedirect } from "@/lib/supabase";
import { useUIStore } from "@/store/useUIStore";
import { Logo } from "@/components/Logo";

type NavItem = { href: string; label: string; icon: string; showBadge?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Intelligence feed", icon: "rss_feed" },
  { href: "/map", label: "Global map", icon: "public" },
  { href: "/alerts", label: "Alerts", icon: "notifications_active", showBadge: true },
  { href: "/calendar", label: "Calendar", icon: "calendar_month" },
  { href: "/archive", label: "Archive", icon: "archive" },
  { href: "/watchlist", label: "Watchlist", icon: "visibility" },
  { href: "/backtesting", label: "Backtesting", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount, mobileSidebarOpen, setMobileSidebarOpen, startTour } = useUIStore();

  async function handleLogout() {
    await signOutAndRedirect();
  }

  // Mobile-only equivalent of TopBar's "Help & Guidance" replay-tour button
  // (hidden md:block there, since desktop has its own trigger) — without this,
  // a mobile user who dismissed or completed the tour had no way to see it again.
  function handleReplayTour() {
    setMobileSidebarOpen(false);
    startTour();
    if (pathname !== "/dashboard") router.push("/dashboard");
  }

  // Close the off-canvas drawer after a navigation so it doesn't stay over
  // the next page. No-op at md+ where the aside is always visible.
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  return (
    <>
    {mobileSidebarOpen && (
      <div
        data-testid="mobile-sidebar-backdrop"
        className="fixed inset-0 z-[45] bg-black/60 md:hidden"
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden
      />
    )}
    {/* Labelled <aside> so it's distinguishable from the map page's own <aside>
        ("Intelligence stream") — axe `landmark-unique`, /map. Keeping it a
        landmark (vs. a bare <div>) is what keeps the logo/help/logout content
        inside a landmark region (axe `region`). */}
    <aside
      aria-label="Primary navigation"
      className={`fixed left-0 top-0 h-full flex flex-col z-50 transition-transform duration-200 ease-out ${
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0`}
      style={{
        width: "256px",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo variant="icon" className="h-5 shrink-0" />
            <span className="font-headline font-semibold text-sm text-[var(--text-primary)]">
              Blue Beacon Research
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="space-y-1" data-tour="sidebar-nav">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 relative"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontSize: "13px",
                  color: active ? "var(--interactive)" : "var(--text-secondary)",
                  borderLeft: active ? "2px solid var(--interactive)" : "2px solid transparent",
                  backgroundColor: active ? "var(--bg-primary)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
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
                {item.showBadge && unreadCount > 0 && (
                  <span
                    className="ml-auto text-[12px] md:text-[8px] font-bold px-1.5 py-0.5"
                    style={{
                      backgroundColor: "var(--danger-subtle)",
                      color: "var(--on-danger-subtle)",
                      borderRadius: "9999px",
                    }}
                    aria-label="unread alerts"
                    title="unread alerts"
                  >
                    {unreadCount}
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
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-app)" }}
      >
        <div className="text-[12px] md:text-[10px] mb-4" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--interactive)" }}>
          Node: BB-ALPHA-09
        </div>
        <Link
          href="/help"
          className="flex items-center gap-2 w-full text-left transition-colors"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "12px", color: pathname === "/help" || pathname.startsWith("/help/") ? "var(--interactive)" : "var(--text-secondary)", padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color =
              pathname === "/help" || pathname.startsWith("/help/") ? "var(--interactive)" : "var(--text-secondary)";
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>help</span>
          Help
        </Link>
        <button
          onClick={handleReplayTour}
          className="md:hidden flex items-center gap-2 w-full text-left transition-colors"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "12px", color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>replay</span>
          Replay Tour
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full text-left transition-colors"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "12px", color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>logout</span>
          Logout
        </button>
      </div>
    </aside>
    </>
  );
}
