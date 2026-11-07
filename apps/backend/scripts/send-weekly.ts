/**
 * Send one edition of The Beacon Weekly, or count it without sending.
 *
 * Default is a dry run: messages are built and counted, nothing is sent,
 * and nothing is written. Sending requires --send, plus WEEKLY_SEND_ENABLED=true,
 * a non-sample edition file, --max between 1 and 90, and --edition matching
 * the number inside the file.
 *
 *   pnpm --filter backend exec tsx scripts/send-weekly.ts --edition-file <path> --edition <n> [--send] [--max <n>]
 *
 * Does not print subscriber email addresses.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../src/clients/supabase.js";
import { getEnv } from "../src/env.js";
import {
  isMissingWeeklySendLogError,
  runWeeklySend,
  validateEditionFile,
  type WeeklySendLogRow,
  type WeeklySubscriber,
} from "../src/lib/weekly-send.js";
import { EmailService } from "../src/services/email.service.js";

const PAGE_SIZE = 1000;
const PUBLIC_APP_URL = "https://bluebeaconresearch.com";

type Args = {
  editionFile: string;
  editionNumber: number;
  send: boolean;
  max: number;
};

export function parseWeeklySendArgs(argv: string[]): Args {
  let editionFile = "";
  let editionRaw = "";
  let send = false;
  let max = 0;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--send") {
      send = true;
    } else if (arg === "--edition-file") {
      editionFile = argv[++i] ?? "";
    } else if (arg === "--edition") {
      editionRaw = argv[++i] ?? "";
    } else if (arg === "--max") {
      const raw = argv[++i] ?? "";
      if (!/^\d+$/.test(raw)) throw new Error("max must be an integer");
      max = Number(raw);
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }
  if (!editionFile) throw new Error("missing --edition-file");
  if (!/^\d+$/.test(editionRaw)) throw new Error("missing --edition");
  return { editionFile, editionNumber: Number(editionRaw), send, max };
}

function subscriberFromRow(row: {
  id?: string | null;
  email?: string | null;
  unsubscribe_token?: string | null;
}): WeeklySubscriber {
  if (!row.id || !row.email || !row.unsubscribe_token) {
    throw new Error("a confirmed subscriber row is incomplete");
  }
  return { id: row.id, email: row.email, unsubscribe_token: row.unsubscribe_token };
}

async function assertWeeklySendLogExists(): Promise<void> {
  const { error } = await getSupabaseAdmin().from("weekly_send_log").select("id").limit(1);
  if (!error) return;
  if (isMissingWeeklySendLogError(error)) {
    console.error("migration not applied");
    process.exit(1);
  }
  console.error("could not read the weekly send log");
  process.exit(1);
}

async function loadConfirmed(): Promise<WeeklySubscriber[]> {
  const rows: WeeklySubscriber[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabaseAdmin()
      .from("newsletter_subscribers")
      .select("id, email, unsubscribe_token")
      .eq("status", "confirmed")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("could not read confirmed subscribers");
    const batch = data ?? [];
    for (const row of batch) rows.push(subscriberFromRow(row));
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadSentIds(edition: number): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabaseAdmin()
      .from("weekly_send_log")
      .select("subscriber_id")
      .eq("edition", edition)
      .eq("status", "sent")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isMissingWeeklySendLogError(error)) {
        console.error("migration not applied");
        process.exit(1);
      }
      throw new Error("could not read the weekly send log");
    }
    const batch = data ?? [];
    for (const row of batch) {
      if (typeof row.subscriber_id === "string") ids.add(row.subscriber_id);
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return ids;
}

async function record(row: WeeklySendLogRow): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("weekly_send_log")
    .upsert(
      {
        edition: row.edition,
        subscriber_id: row.subscriber_id,
        status: row.status,
        resend_id: row.resend_id,
        error: row.error,
      },
      { onConflict: "edition,subscriber_id" },
    );
  if (!error) return;
  if (isMissingWeeklySendLogError(error)) {
    console.error("migration not applied");
    process.exit(1);
  }
  throw new Error("could not write the weekly send log");
}

export async function main(argv: string[]): Promise<void> {
  const args = parseWeeklySendArgs(argv);
  const env = getEnv();
  let raw: string;
  try {
    raw = readFileSync(args.editionFile, "utf8");
  } catch {
    throw new Error("could not read the edition file");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("edition file is not valid JSON");
  }
  const edition = validateEditionFile(parsed);
  await assertWeeklySendLogExists();

  const mode = args.send ? "send" : "dry-run";
  const email = mode === "send" ? new EmailService() : null;
  await runWeeklySend(
    {
      edition,
      editionNumber: args.editionNumber,
      mode,
      max: args.max,
      appUrl: env.NEXT_PUBLIC_APP_URL || PUBLIC_APP_URL,
      env: process.env,
    },
    {
      loadConfirmed,
      loadSentIds,
      record,
      send: email
        ? (opts) => email.send(opts)
        : async () => {
            throw new Error("dry-run tried to send");
          },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "weekly send failed";
    console.error(message.includes("@") ? "weekly send failed" : message);
    process.exit(1);
  });
}
