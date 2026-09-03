"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type TelegramStatus = {
  telegramConnected: boolean;
  telegramChatId: string | null;
};

// Mirrors the 10-minute TTL the backend mints connect codes with (Redis
// `tg_connect:<code>` EX 600 in apps/backend/src/routes/telegram.ts) so the UI stops
// offering a code that's already dead server-side instead of polling one that can
// never succeed.
const CODE_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;

/**
 * Real in-app entry point for the Telegram linking flow (previously nothing in the
 * UI called POST /api/telegram/connect-code — see project memory
 * project_telegram_linking_not_built.md). Flow: mint a code here, the user sends
 * "/connect <code>" to @BlueBeaconResearchBot on Telegram, the bot's webhook
 * (apps/backend/src/routes/telegram.ts) upserts user_channels.telegram_chat_id, and
 * this component's status poll picks up the change and stops on its own.
 */
export function TelegramConnect() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [codeIssuedAt, setCodeIssuedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const expired = codeIssuedAt !== null && now - codeIssuedAt > CODE_TTL_MS;

  const { data: status, isLoading } = useQuery({
    queryKey: ["telegram", "status"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/status");
      if (!res.ok) throw new Error("Failed to load Telegram status");
      return (await res.json()) as TelegramStatus;
    },
    // Only poll while a live connect code is outstanding and not yet linked — no
    // point hammering this once connected, before the flow starts, or after the
    // code lapses. Function form (not `status` from this same hook's return, which
    // would be circular) — reads the query's own latest data instead.
    refetchInterval: (query) =>
      !query.state.data?.telegramConnected && code && !expired ? POLL_INTERVAL_MS : false,
  });

  // Countdown tick so `expired` above re-evaluates without a fresh network response.
  useEffect(() => {
    if (!code || expired) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [code, expired]);

  // Fire the "connected" toast once, on the transition, without feeding back into
  // React state — the render below already switches to the "Linked" branch off
  // `status?.telegramConnected` alone, so `code`/`codeIssuedAt` don't need clearing.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (status?.telegramConnected && code && !notifiedRef.current) {
      notifiedRef.current = true;
      toast.success("Telegram Connected", {
        description: "Alert rules with a Telegram channel will now deliver to this chat.",
      });
    }
  }, [status?.telegramConnected, code]);

  const generateCode = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telegram/connect-code", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to generate connect code");
      return json as { code: string };
    },
    onSuccess: (data) => {
      setCode(data.code);
      setCodeIssuedAt(Date.now());
      queryClient.invalidateQueries({ queryKey: ["telegram", "status"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to generate connect code");
    },
  });

  if (isLoading) {
    return (
      <div className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant animate-pulse">
        Checking Telegram link...
      </div>
    );
  }

  if (status?.telegramConnected) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label text-[10px] font-bold uppercase">Telegram</p>
          <p className="text-[10px] text-on-surface-variant">
            Connected — chat ID {status.telegramChatId}
          </p>
        </div>
        <span className="px-2 py-0.5 text-[9px] label font-bold uppercase tracking-widest rounded-sm border bg-primary/10 border-primary/50 text-primary shrink-0">
          Linked
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-label text-[10px] font-bold uppercase">Telegram</p>
          <p className="text-[10px] text-on-surface-variant">
            Not connected — link your account to receive alerts in Telegram.
          </p>
        </div>
        <button
          onClick={() => generateCode.mutate()}
          disabled={generateCode.isPending}
          className="bg-primary px-4 py-2 rounded text-black font-bold text-[10px] uppercase tracking-widest disabled:opacity-50 shrink-0"
        >
          {generateCode.isPending ? "Generating..." : code ? "Regenerate Code" : "Connect Telegram"}
        </button>
      </div>

      {code && !expired && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded p-4 space-y-2">
          <p className="text-[10px] text-on-surface-variant">
            1. Open Telegram and search for <strong className="text-on-surface">@BlueBeaconResearchBot</strong>.
          </p>
          <p className="text-[10px] text-on-surface-variant">2. Send this exact message to the bot:</p>
          <code className="block bg-black/30 text-primary font-mono text-xs px-3 py-2 rounded select-all">
            /connect {code}
          </code>
          <p className="text-[10px] text-on-surface-variant">
            Waiting for confirmation — this updates automatically once linked. Code expires in 10 minutes.
          </p>
        </div>
      )}

      {code && expired && (
        <p className="text-[10px] text-error">Code expired. Click Connect Telegram again to generate a new one.</p>
      )}
    </div>
  );
}
