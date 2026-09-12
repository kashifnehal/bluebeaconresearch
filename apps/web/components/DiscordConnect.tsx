"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isDiscordWebhookUrl } from "@/lib/discord-webhook";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Webhook-URL-paste connect for Discord alerts. No bot, no OAuth — a one-shot
 * paste + save, plus a server-side Test ping. Visual language matches
 * TelegramConnect (label / 10px helper / Linked badge) without copying its
 * connect-code polling flow.
 */
export function DiscordConnect() {
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const connected = Boolean(connectedAt);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("user_channels")
        .select("discord_webhook_url, discord_connected_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.discord_webhook_url) setWebhookUrl(data.discord_webhook_url);
      setConnectedAt(data?.discord_connected_at ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const upsertDiscord = async (payload: {
    discord_webhook_url: string | null;
    discord_connected_at: string | null;
  }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase client not available");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");
    const { error } = await supabase.from("user_channels").upsert(
      {
        user_id: user.id,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["user-channels", "connected"] });
  };

  const handleSave = async () => {
    const trimmed = webhookUrl.trim();
    if (!isDiscordWebhookUrl(trimmed)) {
      toast.error("Paste a valid Discord webhook URL");
      return;
    }
    setSaving(true);
    setTestResult(null);
    setTestError(null);
    try {
      const connectedAtIso = new Date().toISOString();
      await upsertDiscord({
        discord_webhook_url: trimmed,
        discord_connected_at: connectedAtIso,
      });
      setWebhookUrl(trimmed);
      setConnectedAt(connectedAtIso);
      toast.success("Discord Connected", {
        description: "Alert rules with a Discord channel will now deliver to this webhook.",
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save Discord webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setTestResult(null);
    setTestError(null);
    try {
      await upsertDiscord({
        discord_webhook_url: null,
        discord_connected_at: null,
      });
      setWebhookUrl("");
      setConnectedAt(null);
      toast.success("Discord disconnected");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect Discord");
    } finally {
      setClearing(false);
    }
  };

  const handleTest = async () => {
    const trimmed = webhookUrl.trim();
    if (!isDiscordWebhookUrl(trimmed)) {
      setTestResult("fail");
      setTestError("Paste a valid Discord webhook URL first");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const res = await fetch("/api/discord/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setTestResult("fail");
        setTestError(json?.error?.message ?? "Test failed");
        return;
      }
      if (json?.ok) {
        setTestResult("ok");
        setTestError(null);
      } else {
        setTestResult("fail");
        setTestError(typeof json?.error === "string" ? json.error : "Test failed");
      }
    } catch (err: unknown) {
      setTestResult("fail");
      setTestError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant animate-pulse">
        Checking Discord link...
      </div>
    );
  }

  if (connected) {
    return (
      <div className="space-y-3" data-testid="discord-connect">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-label text-[10px] font-bold uppercase">Discord</p>
            <p className="text-[10px] text-on-surface-variant">
              Connected — webhook saved. Alerts will deliver to this channel.
            </p>
          </div>
          <span className="px-2 py-0.5 text-[9px] label font-bold uppercase tracking-widest rounded-sm border bg-primary/10 border-primary/50 text-primary shrink-0">
            Linked
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="bg-primary px-4 py-2 rounded text-black font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            {clearing ? "Disconnecting..." : "Disconnect"}
          </button>
          {testResult === "ok" && (
            <span className="text-[10px] text-primary font-bold uppercase">Test delivered</span>
          )}
          {testResult === "fail" && (
            <span className="text-[10px] text-error">{testError ?? "Test failed"}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="discord-connect">
      <div>
        <p className="font-label text-[10px] font-bold uppercase">Discord</p>
        <p className="text-[10px] text-on-surface-variant">
          Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL
        </p>
      </div>
      <input
        type="url"
        aria-label="Discord webhook URL"
        placeholder="https://discord.com/api/webhooks/…"
        value={webhookUrl}
        onChange={(e) => {
          setWebhookUrl(e.target.value);
          setTestResult(null);
          setTestError(null);
        }}
        className="w-full bg-surface-container-lowest border-b border-outline-variant p-3 font-mono text-sm focus:border-primary focus:outline-none transition-colors text-on-surface outline-none"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary px-4 py-2 rounded text-black font-bold text-[10px] uppercase tracking-widest disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 rounded border border-outline-variant/40 text-[10px] font-bold uppercase tracking-widest text-on-surface hover:border-primary/50 disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test"}
        </button>
        {testResult === "ok" && (
          <span className="text-[10px] text-primary font-bold uppercase">Test delivered</span>
        )}
        {testResult === "fail" && (
          <span className="text-[10px] text-error">{testError ?? "Test failed"}</span>
        )}
      </div>
    </div>
  );
}
