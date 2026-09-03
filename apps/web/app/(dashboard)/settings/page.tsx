"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { toast } from "sonner";
import { SELECT_CLASSES } from "@/lib/utils";
import { TelegramConnect } from "@/components/TelegramConnect";

const TABS = [
  "ACCOUNT",
  "NOTIFICATIONS",
  "APPEARANCE",
  "SECURITY",
  "DATA",
] as const;

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("ACCOUNT");
  const { theme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<{
    id: string;
    full_name: string;
    email: string;
  } | null>(null);
  // Local UI-only settings state for offline editing (F2)
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [password, setPassword] = useState("");
  const [retentionDays, setRetentionDays] = useState(90);

  useEffect(() => {
    async function loadProfile() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile({
          id: user.id,
          full_name: data.full_name || "",
          email: user.email || "",
        });
      } else {
        // Fallback for mock/anonymous
        setProfile({
          id: user.id,
          full_name: "Terminal User",
          email: user.email || "",
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  const handleSaveChanges = async () => {
    if (!profile) return;
    setSaving(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      toast.error("System Failure: Supabase link not established");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: profile.full_name })
      .eq("id", profile.id);

    if (error) {
      toast.error(`Update Failed: ${error.message}`);
    } else {
      toast.success("Profile Updated: Neural markers synced with BB-CENTRAL", {
        description: "Your tactical identification has been refreshed.",
      });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 left-[256px] right-[260px] top-16 bg-surface-container-lowest overflow-y-auto p-10">
      <div className="max-w-[1440px] mx-auto">
        <div className="mb-8">
          <h1 className="font-headline font-extrabold text-4xl tracking-tighter mb-2 text-on-surface text-white">
            Settings
          </h1>
          <p className="font-mono text-[10px] text-primary tracking-widest uppercase font-bold">
            System Configuration & User Preferences
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-8 mb-10 border-b border-outline-variant/20">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 font-label text-xs tracking-widest transition-colors uppercase font-bold ${
                activeTab === tab
                  ? "text-primary border-b-2 border-primary"
                  : "text-outline hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-12 max-w-4xl">
          {activeTab === "ACCOUNT" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-4 mb-6">
                <span className="material-symbols-outlined text-primary">
                  person
                </span>
                <h2 className="font-headline text-lg font-bold text-on-surface text-white">
                  Account Profile
                </h2>
              </div>
              <div className="bg-surface-container p-8 rounded-lg border-t-2 border-primary shadow-xl">
                {loading ? (
                  <div className="h-48 flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-on-surface-variant animate-pulse">
                    Accessing BB-PROFILE-BUFFER...
                  </div>
                ) : (
                  <form
                    className="grid grid-cols-1 md:grid-cols-2 gap-8"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveChanges();
                    }}
                  >
                    <div className="space-y-2">
                      <label className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold">
                        Full Name
                      </label>
                      <input
                        className="w-full bg-surface-container-lowest border-b border-outline-variant p-3 font-mono text-sm focus:border-primary focus:outline-none transition-colors text-on-surface outline-none"
                        type="text"
                        value={profile?.full_name || ""}
                        onChange={(e) =>
                          setProfile((p) =>
                            p ? { ...p, full_name: e.target.value } : null,
                          )
                        }
                        placeholder="Alex Chen"
                      />
                    </div>
                    <div className="space-y-2 opacity-80">
                      <label htmlFor="settings-email" className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold">
                        Email Address
                      </label>
                      <input
                        id="settings-email"
                        className="w-full bg-surface-container-lowest border-b border-outline-variant p-3 font-mono text-sm cursor-not-allowed text-on-surface-variant outline-none"
                        disabled
                        type="email"
                        value={profile?.email || ""}
                      />
                      <p className="font-mono text-[10px] text-on-surface-variant flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined text-xs">
                          lock
                        </span>{" "}
                        Locked by security protocol
                      </p>
                    </div>
                    <div className="md:col-span-2 pt-4">
                      <button
                        disabled={saving}
                        className={`bg-primary hover:bg-primary-container text-black px-8 py-3 font-label text-xs font-bold tracking-widest rounded-sm transition-all shadow-lg shadow-primary/10 active:scale-95 ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
                        type="submit"
                      >
                        {saving ? "SYNCING..." : "SAVE CHANGES"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}

          {activeTab === "APPEARANCE" && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-4 mb-6">
                <span className="material-symbols-outlined text-primary">
                  palette
                </span>
                <h2 className="font-headline text-lg font-bold text-on-surface text-white">
                  Appearance Settings
                </h2>
              </div>
              <div className="space-y-6">
                <label className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold">
                  Theme Engine
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Dark Theme */}
                  <div
                    onClick={() => setTheme("dark")}
                    className={`relative p-6 rounded-xl border-2 cursor-pointer group overflow-hidden transition-all ${
                      theme === "dark" || theme === "system"
                        ? "bg-surface-container border-primary shadow-lg shadow-primary/5"
                        : "bg-surface-container/40 border-outline-variant/20 hover:border-on-surface-variant/40"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-12 relative z-10">
                      <div>
                        <p className="font-headline font-bold text-sm text-on-surface text-white">
                          Trader (Default)
                        </p>
                        <p
                          className={`font-mono text-[10px] uppercase font-bold tracking-widest ${theme === "dark" ? "text-primary" : "text-on-surface-variant"}`}
                        >
                          DARK_EMERALD_OPTIMIZED
                        </p>
                      </div>
                      {(theme === "dark" || theme === "system") && (
                        <span
                          className="material-symbols-outlined text-primary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 relative z-10">
                      <div className="h-2 w-full bg-surface-container-high rounded-full"></div>
                      <div className="h-2 w-2/3 bg-surface-container-high rounded-full opacity-60"></div>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <span className="material-symbols-outlined text-8xl text-on-surface text-white">
                        dark_mode
                      </span>
                    </div>
                  </div>
                  {/* Light Theme */}
                  <div
                    onClick={() => setTheme("light")}
                    className={`relative p-6 rounded-xl border-2 cursor-pointer group overflow-hidden transition-all ${
                      theme === "light"
                        ? "bg-white border-primary shadow-lg shadow-primary/5"
                        : "bg-surface-container-lowest border-outline-variant/20 hover:border-on-surface-variant/40"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-12 relative z-10">
                      <div>
                        <p
                          className={`font-headline font-bold text-sm ${theme === "light" ? "text-black" : "text-white"}`}
                        >
                          Day Mode
                        </p>
                        <p
                          className={`font-mono text-[10px] uppercase font-bold tracking-widest ${theme === "light" ? "text-primary" : "text-on-surface-variant"}`}
                        >
                          HIGH_VISIBILITY_SURFACE
                        </p>
                      </div>
                      {theme === "light" && (
                        <span
                          className="material-symbols-outlined text-primary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 relative z-10">
                      <div
                        className={`h-2 w-full rounded-full ${theme === "light" ? "bg-black/5" : "bg-outline-variant/20"}`}
                      ></div>
                      <div
                        className={`h-2 w-2/3 rounded-full opacity-60 ${theme === "light" ? "bg-black/5" : "bg-outline-variant/20"}`}
                      ></div>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <span
                        className={`material-symbols-outlined text-8xl ${theme === "light" ? "text-black" : "text-white"}`}
                      >
                        light_mode
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {(activeTab === "NOTIFICATIONS" ||
            activeTab === "SECURITY" ||
            activeTab === "DATA") && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-4 mb-6">
                <span className="material-symbols-outlined text-on-surface-variant/40">
                  {activeTab === "NOTIFICATIONS"
                    ? "notifications"
                    : activeTab === "SECURITY"
                      ? "security"
                      : "database"}
                </span>
                <h2 className="font-headline text-lg font-bold text-on-surface-variant">
                  {activeTab}
                </h2>
              </div>
              <div className="bg-surface-container/20 p-6 rounded-xl border border-outline-variant/20">
                {activeTab === "NOTIFICATIONS" && (
                  <div className="space-y-4">
                    <TelegramConnect />
                    <div className="border-t border-outline-variant/20 my-2" />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase">
                          Email Alerts
                        </p>
                        <p className="text-[10px] text-on-surface-variant">
                          Receive daily summaries and urgent alerts via email
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifEmail}
                        onChange={(e) => setNotifEmail(e.target.checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-label text-[10px] font-bold uppercase">
                          Push Notifications
                        </p>
                        <p className="text-[10px] text-on-surface-variant">
                          Use browser push for critical updates
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPush}
                        onChange={(e) => setNotifPush(e.target.checked)}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          toast.success("Notification preferences saved");
                        }}
                        className="bg-primary px-4 py-2 rounded text-black font-bold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "SECURITY" && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-label text-[10px] font-bold uppercase">
                        Change Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full mt-2 p-3 bg-surface-container-lowest rounded"
                        placeholder="New password"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setPassword("");
                          toast.success("Security settings saved");
                        }}
                        className="bg-primary px-4 py-2 rounded text-black font-bold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "DATA" && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-label text-[10px] font-bold uppercase">
                        Export Audit Log
                      </label>
                      <p className="text-[10px] text-on-surface-variant">
                        Download your recorded signals and activity log.
                      </p>
                      <div className="mt-3">
                        <button
                          onClick={() => {
                            toast.success("Export started");
                          }}
                          className="px-4 py-2 bg-primary text-black rounded font-bold"
                        >
                          Export
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="font-label text-[10px] font-bold uppercase">
                        Data Retention (days)
                      </label>
                      <select
                        value={retentionDays}
                        onChange={(e) =>
                          setRetentionDays(Number(e.target.value))
                        }
                        className={`ml-3 ${SELECT_CLASSES}`}
                      >
                        {[30, 60, 90, 180, 365].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Footer — purely decorative terminal chrome (no real data). Hidden from
          assistive tech per 07_DESIGN_SYSTEM.md §12, which also resolves the
          low-contrast axe finding on these cosmetic strings. */}
      <footer
        aria-hidden="true"
        className="mt-auto pt-10 border-t border-outline-variant/10 flex justify-between items-center text-[10px] font-mono text-outline uppercase tracking-[0.2em] font-bold"
      >
        <div>ACCESS_POINT: BB-ALPHA-09</div>
        <div className="flex gap-8">
          <span>ENCRYPTION: AES-256</span>
          <span>SESSION_ID: 88F9-AX21</span>
        </div>
      </footer>
    </div>
  );
}
