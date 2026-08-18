"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { NotificationPanel } from "@/components/NotificationPanel";
import { HelpModal } from "@/components/HelpModal";
import { getSupabaseBrowserClient, signOutAndRedirect } from "@/lib/supabase";

export function TopBar() {
  const router = useRouter();
  const {
    searchQuery,
    setSearchQuery,
    notifOpen,
    setNotifOpen,
    unreadCount,
    setHelpOpen,
  } = useUIStore();
  const { setSearchSubmitted } = useUIStore();

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    initials: string;
  } | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced sync from local input to global searchQuery store
  const handleInputChange = (val: string) => {
    setLocalQuery(val);
    // Clear any previous server-submitted search while editing
    setSearchSubmitted(null);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const trimmed = val.trim();
      // Only apply client-side filtering when user has typed at least 3 chars,
      // or when clearing the field entirely.
      if (trimmed.length === 0) {
        setSearchQuery("");
      } else if (trimmed.length >= 3) {
        setSearchQuery(trimmed);
      }
    }, 300);
  };

  const handleClear = () => {
    setLocalQuery("");
    setSearchQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && localQuery.trim().length >= 3) {
      // Trigger server-side search
      const q = localQuery.trim();
      setSearchQuery(q);
      setSearchSubmitted(q);
    }
  };

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
          name: "Terminal Sentinel",
          email: "sentinel@bluebeacon.com",
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
        className="fixed top-0 right-0 z-40 flex items-center justify-between px-6"
        style={{
          left: "256px",
          height: "64px",
          backgroundColor: "#000000",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        {/* Left: Search Bar */}
        <div className="flex items-center gap-4 flex-1">
          <div className="relative w-full max-w-md">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2"
              style={{ fontSize: "16px", color: "#86948a" }}
            >
              search
            </span>
            <input
              value={localQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full border-none border-b focus:ring-0 text-xs py-2 pl-10 pr-8"
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
            {localQuery && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#86948a] hover:text-[#e5e2e1] transition-colors p-1"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "14px" }}
                >
                  close
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Icons + User Avatar */}
        <div className="flex items-center gap-6">
          <div className="flex gap-4 items-center">
            {/* Notification Bell Button */}
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative transition-colors"
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
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "24px" }}
              >
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ee7d77] animate-pulse" />
              )}
            </button>

            {/* Help Button */}
            <button
              onClick={() => setHelpOpen(true)}
              className="transition-colors"
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
                  {user?.name || "Terminal Sentinel"}
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
                className="flex items-center justify-center font-bold border rounded-sm transition-all"
                style={{
                  width: "32px",
                  height: "32px",
                  fontSize: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  backgroundColor: avatarOpen ? "#4edea3" : "#2a2a2a",
                  borderColor: "#3c4a42",
                  color: avatarOpen ? "#003824" : "#4edea3",
                  cursor: "pointer",
                }}
                title="User Menu"
              >
                {user?.initials || "GS"}
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
                  <p className="text-[10px] text-[#86948a] font-mono truncate">
                    {user?.email || "sentinel@bluebeacon.com"}
                  </p>
                </div>

                <div className="py-1">
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
    </>
  );
}
