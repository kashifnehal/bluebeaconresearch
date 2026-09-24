"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { NotificationPanel } from "@/components/NotificationPanel";
import { HelpModal } from "@/components/HelpModal";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationConnectModal } from "@/components/NotificationConnectModal";
import { getSupabaseBrowserClient, signOutAndRedirect } from "@/lib/supabase";

export function TopBar() {
  const router = useRouter();
  const {
    notifOpen,
    setNotifOpen,
    unreadCount,
    setHelpOpen,
    notificationConnectOpen,
    setNotificationConnectOpen,
    setCommandPaletteOpen,
  } = useUIStore();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    initials: string;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current user details for dropdown
  useEffect(() => {
    async function loadUser() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (currentUser) {
        const name =
          currentUser.user_metadata?.full_name ||
          currentUser.email?.split("@")[0] ||
          "Terminal User";
        const email = currentUser.email || "";
        const parts = name.trim().split(" ");
        const initials = (parts[0]?.[0] || "G") + (parts[1]?.[0] || "S");
        setUser({ name, email, initials: initials.toUpperCase() });
      } else {
        setUser({
          name: "Account",
          email: "",
          initials: "GS",
        });
      }
    }
    loadUser();
  }, []);

  // Close avatar dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setAvatarOpen(false);
    await signOutAndRedirect();
  };

  return (
    <>
      <header
        className="fixed top-0 right-0 left-0 md:left-[256px] z-40 flex items-center justify-between px-6"
        style={{
          height: "64px",
          backgroundColor: "#000000",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        {/* Search Bar. Mobile nav is MobileTabBar's "More" tab now (below
            md), which opens the same drawer this hamburger used to. */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative w-full max-w-md min-w-0">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ fontSize: "16px", color: "#86948a" }}
            >
              search
            </span>
            <button
              type="button"
              aria-label="Open search"
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full border-none border-b focus:ring-0 text-xs py-2 pl-10 pr-8 text-left"
              style={{
                backgroundColor: "#0e0e0e",
                borderBottom: "1px solid #3c4a42",
                color: "#86948a",
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
                cursor: "pointer",
              }}
            >
              Search signals, coordinates, entities...
            </button>
          </div>
        </div>

        {/* Right: Icons + User Avatar */}
        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <div className="flex gap-2 md:gap-4 items-center">
            {/* Connect-a-channel (Telegram). Distinct from the alerts bell.
                Hidden below md — same flow is reachable from Settings
                (TelegramConnect/DiscordConnect), which the mobile drawer
                links to, so nothing is lost, just decluttered at 360-414px. */}
            <button
              onClick={() => setNotificationConnectOpen(!notificationConnectOpen)}
              className="relative transition-colors hidden md:block"
              style={{
                color: "#bbcac0",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#4edea3";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#bbcac0";
              }}
              aria-label="Connect alert channel"
              title="Connect alert channel"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px" }}
              >
                forum
              </span>
            </button>

            {/* Notification Bell Button */}
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="flex items-center justify-center transition-colors shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
              style={{
                color: "#bbcac0",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#4edea3";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#bbcac0";
              }}
              title="Notifications"
            >
              <span className="relative inline-flex">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "24px" }}
                >
                  notifications
                </span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ee7d77] animate-pulse" />
                )}
              </span>
            </button>

            {/* Help Button. Hidden below md — reachable from the mobile
                drawer's Help link (Sidebar footer) and from the avatar
                dropdown's Help item, both of which remain visible. */}
            <button
              onClick={() => setHelpOpen(true)}
              className="transition-colors hidden md:block"
              style={{
                color: "#bbcac0",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#4edea3";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#bbcac0";
              }}
              title="Help & Guidance"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px" }}
              >
                help
              </span>
            </button>
          </div>

          <div
            className="hidden md:block"
            style={{ width: "1px", height: "32px", backgroundColor: "#3c4a42" }}
          />

          {/* User Info & Avatar Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div
                  style={{
                    fontSize: "12px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: "#4edea3",
                    letterSpacing: "0.05em",
                  }}
                >
                  {user?.name || "Account"}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#86948a",
                  }}
                >
                  v2.4.0-STABLE
                </div>
              </div>

              <button
                onClick={() => setAvatarOpen(!avatarOpen)}
                className="flex items-center justify-center transition-all min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
                title="User Menu"
              >
                <span
                  className="flex items-center justify-center font-bold border rounded-sm"
                  style={{
                    width: "32px",
                    height: "32px",
                    fontSize: "10px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    backgroundColor: avatarOpen ? "#4edea3" : "#2a2a2a",
                    borderColor: "#3c4a42",
                    color: avatarOpen ? "#003824" : "#4edea3",
                  }}
                >
                  {user?.initials || "GS"}
                </span>
              </button>
            </div>

            {/* Dropdown Menu */}
            {avatarOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-[#131313] border border-[#3c4a42] rounded-md shadow-2xl z-50 py-2 text-xs text-[#e5e2e1] animate-in fade-in slide-in-from-top-2 duration-150"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <div className="px-4 py-2 border-b border-[#2a2a2a]">
                  <p className="font-bold text-[#e5e2e1] truncate">
                    {user?.name || "Terminal User"}
                  </p>
                  <p className="text-[12px] md:text-[10px] text-[#86948a] font-mono truncate">
                    {user?.email || ""}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setAvatarOpen(false);
                      router.push("/help");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#201f1f] hover:text-[#4edea3] flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "16px" }}
                    >
                      help
                    </span>
                    Help
                  </button>

                  <button
                    onClick={() => {
                      setAvatarOpen(false);
                      router.push("/settings");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#201f1f] hover:text-[#4edea3] flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "16px" }}
                    >
                      settings
                    </span>
                    Settings
                  </button>

                  <button
                    onClick={() => {
                      setAvatarOpen(false);
                      router.push("/alerts");
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-[#201f1f] hover:text-[#4edea3] flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "16px" }}
                    >
                      notifications
                    </span>
                    Alert Rules
                  </button>
                </div>

                <div className="border-t border-[#2a2a2a] pt-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 hover:bg-[#7f2927]/20 text-[#ff9993] flex items-center gap-2 transition-colors"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "16px" }}
                    >
                      logout
                    </span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Slide-in Notification Drawer */}
      <NotificationPanel />

      {/* Centered Help Modal */}
      <HelpModal />

      {/* Telegram connect (header icon + contextual prompt share this) */}
      <NotificationConnectModal />

      {/* Global Cmd+K / Ctrl+K search */}
      <CommandPalette />
    </>
  );
}
