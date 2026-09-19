/**
 * One-shot #146 seed — 10 pre-confirmed prospect/demo Auth users.
 *
 * Admin API createUser({ email_confirm: true }) marks email_confirmed_at without
 * sending a confirmation email and without turning Confirm Email off globally.
 * app_metadata.is_test_account is the only source handle_new_user() copies
 * (user_metadata is client-editable and must not self-flag).
 *
 * Idempotent: existing emails are updated in place, not duplicated. Passwords
 * for newly created accounts are written to repo-root `.demo-accounts.local.json`
 * (gitignored). Re-runs do not rotate passwords unless RESET_DEMO_PASSWORDS=1.
 *
 * Usage (from apps/backend):
 *   pnpm seed:demo-accounts
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CREDENTIALS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../../.demo-accounts.local.json");

type StoredFile = {
  generated_at?: string;
  note?: string;
  accounts?: Array<{ email: string; password?: string; created?: boolean }>;
};
import { getEnv } from "../env.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

type DemoSpec = {
  email: string;
  fullName: string;
  useCase: string;
  commodities: string[];
  forexPairs: string[];
  regions: string[];
  watchlist: string[];
};

const DEMOS: DemoSpec[] = [
  {
    email: "demo01@bluebeaconresearch.com",
    fullName: "Maya Okonkwo (TEST)",
    useCase: "trader",
    commodities: ["USOIL", "UKOIL", "NGAS"],
    forexPairs: ["USDCNY"],
    regions: ["middle-east"],
    watchlist: ["USOIL", "UKOIL", "NGAS"],
  },
  {
    email: "demo02@bluebeaconresearch.com",
    fullName: "Jonas Berg (TEST)",
    useCase: "trader",
    commodities: ["XAUUSD", "COPPER"],
    forexPairs: ["USDCHF"],
    regions: ["africa", "asia-pacific"],
    watchlist: ["XAUUSD", "COPPER"],
  },
  {
    email: "demo03@bluebeaconresearch.com",
    fullName: "Priya Raman (TEST)",
    useCase: "importer",
    commodities: ["WHEAT", "CORN"],
    forexPairs: ["EURUSD"],
    regions: ["americas", "eastern-europe"],
    watchlist: ["WHEAT", "CORN"],
  },
  {
    email: "demo04@bluebeaconresearch.com",
    fullName: "Elena Volkova (TEST)",
    useCase: "analyst",
    commodities: ["USOIL"],
    forexPairs: ["USDRUB", "EURUSD"],
    regions: ["eastern-europe"],
    watchlist: ["USOIL", "USDRUB", "EURUSD"],
  },
  {
    email: "demo05@bluebeaconresearch.com",
    fullName: "Daniel Cho (TEST)",
    useCase: "trader",
    commodities: ["NGAS", "UKOIL"],
    forexPairs: ["USDJPY"],
    regions: ["asia-pacific", "middle-east"],
    watchlist: ["NGAS", "UKOIL", "USDJPY"],
  },
  {
    email: "demo06@bluebeaconresearch.com",
    fullName: "Sofia Alvarez (TEST)",
    useCase: "importer",
    commodities: ["COPPER", "CORN"],
    forexPairs: ["GBPUSD"],
    regions: ["americas"],
    watchlist: ["COPPER", "CORN", "GBPUSD"],
  },
  {
    email: "demo07@bluebeaconresearch.com",
    fullName: "Omar Haddad (TEST)",
    useCase: "trader",
    commodities: ["USOIL", "XAUUSD"],
    forexPairs: ["USDCHF"],
    regions: ["middle-east", "global"],
    watchlist: ["USOIL", "XAUUSD"],
  },
  {
    email: "demo08@bluebeaconresearch.com",
    fullName: "Hannah Wright (TEST)",
    useCase: "analyst",
    commodities: ["WHEAT", "NGAS", "USOIL"],
    forexPairs: [],
    regions: ["global"],
    watchlist: ["WHEAT", "NGAS", "USOIL"],
  },
  {
    email: "demo09@bluebeaconresearch.com",
    fullName: "Kenji Mori (TEST)",
    useCase: "trader",
    commodities: ["XAUUSD"],
    forexPairs: ["USDJPY", "USDCNY"],
    regions: ["asia-pacific"],
    watchlist: ["XAUUSD", "USDJPY", "USDCNY"],
  },
  {
    email: "demo10@bluebeaconresearch.com",
    fullName: "Amina Diallo (TEST)",
    useCase: "importer",
    commodities: ["UKOIL", "WHEAT", "COPPER"],
    forexPairs: ["EURUSD"],
    regions: ["africa", "middle-east"],
    watchlist: ["UKOIL", "WHEAT", "COPPER"],
  },
];

function newPassword(): string {
  return `BBR-Demo-${randomBytes(6).toString("base64url")}!`;
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const match = (data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  return match?.id ?? null;
}

async function hydrateProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  spec: DemoSpec,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: spec.fullName,
      plan_tier: "pro",
      onboarding_completed: true,
      product_tour_completed: true,
      is_test_account: true,
      notification_prompt_dismissed_at: now,
    })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { error: prefsError } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      use_case: spec.useCase,
      theme: "dark",
      commodities: spec.commodities,
      forex_pairs: spec.forexPairs,
      regions: spec.regions,
      watchlist_symbols: spec.watchlist,
      watchlist_suggested: false,
      digest_enabled: false,
      onboarding_completed_at: now,
      min_severity: 7,
    },
    { onConflict: "user_id" },
  );
  if (prefsError) throw prefsError;
}

async function main() {
  getEnv();
  const supabase = getSupabaseAdmin();
  const resetPasswords = process.env.RESET_DEMO_PASSWORDS === "1";
  const written: Array<{ email: string; password: string; created: boolean }> = [];

  if (DEMOS.length !== 10) {
    throw new Error(`Expected exactly 10 demo specs, got ${DEMOS.length}`);
  }

  for (const spec of DEMOS) {
    const existingId = await findUserIdByEmail(supabase, spec.email);
    if (existingId) {
      if (resetPasswords) {
        const password = newPassword();
        const { error } = await supabase.auth.admin.updateUserById(existingId, {
          password,
          email_confirm: true,
          app_metadata: { is_test_account: true },
          user_metadata: { full_name: spec.fullName, plan_tier: "pro" },
        });
        if (error) throw error;
        written.push({ email: spec.email, password, created: false });
      } else {
        const { error } = await supabase.auth.admin.updateUserById(existingId, {
          email_confirm: true,
          app_metadata: { is_test_account: true },
          user_metadata: { full_name: spec.fullName, plan_tier: "pro" },
        });
        if (error) throw error;
        written.push({ email: spec.email, password: "(unchanged — see .demo-accounts.local.json)", created: false });
      }
      await hydrateProfile(supabase, existingId, spec);
      console.log(`[seed-demo] updated ${spec.email}`);
      continue;
    }

    const password = newPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: spec.fullName, plan_tier: "pro" },
      app_metadata: { is_test_account: true },
    });
    if (error || !data.user?.id) {
      throw error ?? new Error(`createUser returned no user for ${spec.email}`);
    }
    await hydrateProfile(supabase, data.user.id, spec);
    written.push({ email: spec.email, password, created: true });
    console.log(`[seed-demo] created ${spec.email}`);
  }

  const previous: StoredFile = existsSync(CREDENTIALS_PATH)
    ? (JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as StoredFile)
    : { accounts: [] };
  const previousByEmail = new Map((previous.accounts ?? []).map((a) => [a.email, a.password]));
  const accounts = written.map((w) => ({
    email: w.email,
    password: w.created || resetPasswords ? w.password : previousByEmail.get(w.email),
    created: w.created,
  }));
  writeFileSync(
    CREDENTIALS_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        note: "Prospect/demo logins. Flagged profiles.is_test_account. Do not commit.",
        accounts,
      },
      null,
      2,
    ),
  );
  console.log(`[seed-demo] credentials file: ${CREDENTIALS_PATH}`);
  console.log("[seed-demo] done:", JSON.stringify(written.map((w) => ({ email: w.email, created: w.created }))));
}

main().catch((e) => {
  console.error("[seed-demo] fatal:", e);
  process.exit(1);
});
