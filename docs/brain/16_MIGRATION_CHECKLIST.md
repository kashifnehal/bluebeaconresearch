# 16_MIGRATION_CHECKLIST.md — Schema Deploy Process & Standing Verification Checklist

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

Added 2026-08-18 (commit `97b7c4b` era, this file lands in the next commit) — Reliability/DB-cleanup pass.

## Why this file exists

Every schema change in this project has, until now, been hand-applied via the Supabase SQL editor — no CLI link, no automated push, no verification step baked into the process. This already caused a real incident: `migrations/008_fix_source_constraint.sql` was written, committed, and the changelog (`14_CHANGELOG.md` v0.17.0) recorded it as applied — but it had in fact never been run against the live database. For two days, the GNews collector silently failed every single insert because of it. It was only caught by accident, as a side effect of unrelated RLS verification work (v0.19.0). "Committed" and "live" silently diverged, and nothing would have caught it if that unrelated session hadn't happened to touch the same table.

This is exactly the same failure shape as the alert-pipeline bug fixed 2026-08-18 (v0.20.0): a thing that *looked* done because the code/docs said so, but was never actually verified against reality.

## The real fix: CLI-linked migrations (linked 2026-08-19)

`supabase/config.toml` exists (`supabase init`, 2026-08-18). **Linked to the live project 2026-08-19** — the founder generated a Supabase Personal Access Token (Dashboard → Account → Access Tokens) and added it as `SUPABASE_ACCESS_TOKEN` in `apps/web/.env.local`; `npx supabase link --project-ref evavcgfmemwryggdkjmx` (run with that token exported into the shell) succeeded.

**What this token actually unlocks, confirmed empirically**:
- ✅ **Management API** (`https://api.supabase.com/v1/projects/{ref}/...`) — works. This includes `/advisors/security` and `/advisors/performance`, which is how migration `012`'s effects were verified live (see `04_DATABASE.md` §4 item 13) without needing Dashboard access.
- ❌ **Direct Postgres access via the CLI** (`supabase migration list`, `supabase db push`, `supabase db diff`) — does **not** work on this project. It fails with `permission denied to alter role` — the CLI tries to create/alter a temporary login role for the direct DB connection, and this project's Postgres role permissions reject that. Cause not yet diagnosed (could be a plan-tier restriction, an org policy, or something specific to this project's role setup) — a decision point if automated `db push` is wanted later; for now, schema changes still go through the SQL editor manually, same as before.

**Note on token scope**: this PAT is account-wide (not scoped to just this project) per Supabase's current PAT design — worth knowing if the account has other projects.

> ## ⚠️ UPDATED 2026-08-27 — `db push` is further away than this file implied. Read this before running it.
>
> Two things were re-checked this pass, and one of them is new and load-bearing.
>
> **1. The permission failure still reproduces, verbatim.** `npx supabase migration list --linked`, run with `SUPABASE_ACCESS_TOKEN` exported from `apps/web/.env.local`, still fails at the "Initialising login role..." step:
>
> ```
> LegacyDbConfigLoginRoleStatusError: unexpected login role status 400:
> Failed to create login role: ERROR: 42501: permission denied to alter role
> DETAIL: Only roles with the CREATEROLE attribute and the ADMIN option on
> role "cli_login_postgres" may alter this role.
> ```
>
> So the ❌ line above is current, not stale. The CLI binary itself is fine (`npx supabase --version` → `2.116.0`; it is not on `PATH`, use `npx`).
>
> **2. NEW: the live migration-history table does not know about any of the 13 committed migrations.** Queried directly (this path works, unlike the CLI): `supabase_migrations.schema_migrations` on the live project contains **exactly one row** — `20260817220713 consolidate_user_channels_rls` — which was applied through the Management API, not the CLI. All 13 files in `supabase/migrations/` (`000_init_schema.sql` … `20260817220714_reliability_indexes_parts_2_4.sql`) are absent from it, because every one of them was hand-applied in the SQL editor.
>
> **Why that matters:** `supabase db push` decides what to run by diffing local filenames against that table. It would therefore consider all 13 migrations pending and try to replay them from scratch against a database that already has every object they create. They are **not** fully idempotent — `001_rls_policies.sql` alone has 37 DDL statements with only 23 carrying an `if not exists` / `if exists` / `or replace` guard — so the push would error partway through, possibly after having already executed some statements. **Do not run `supabase db push` against this project until the history table is baselined.**
>
> **What baselining would take** (`supabase migration repair --status applied <version>` for each of 000–012, marking them applied without re-running them) **requires the very same direct-Postgres connection that is currently failing.** So the permission error is the blocker for both, and fixing it is step one either way.
>
> **This is a decision point, deliberately left unresolved here rather than actioned:** baselining rewrites production migration history, and the two plausible routes (grant the CLI's `cli_login_postgres` role the permissions it wants, vs. connect with `--db-url` and the database password, which is not present in this repo's env files) both need founder access and a judgment call about which is acceptable. Nothing was repaired, pushed, or otherwise applied to the live database this pass.
>
> **A note on file naming, if the CLI path is ever adopted:** the committed files use a `000_`–`012_` sequential prefix, while the CLI's own convention (and the one existing history row) is a `YYYYMMDDHHMMSS` timestamp. The CLI parses the leading digits as the version, so the sequential names do sort and function — but they sort *before* every timestamped migration forever. Worth settling deliberately rather than discovering later.

**Going forward, every schema change should be** — noting that step 2's CLI path is currently blocked, see the box above:
```bash
# 1. Write the migration as a new numbered file in supabase/migrations/
#    (e.g. 013_whatever.sql — follow the existing 000-012 numbering)

# 2. Apply it to the live project.
#    TODAY: paste it into the Supabase SQL editor by hand. This is still the only
#    working path — `npx supabase db push` is blocked on both the login-role
#    permission error and the un-baselined history table described above.
#    ONCE UNBLOCKED: npx supabase db push

# 3. Verify it actually applied — never trust the apply step's exit code alone,
#    the 008 incident happened with a migration that *looked* fine.
#    `npx supabase db diff --linked` is the intended check but is blocked by the
#    same permission error, so verify against the live DB directly instead:
#    query information_schema / pg_indexes / pg_policies for the specific object
#    the migration was supposed to create, and run the checklist below.
```

Until the CLI path is unblocked, migrations continue to go through the Supabase SQL editor manually — and the verification step below is mandatory regardless of which path was used to apply them. It is the only thing standing between this project and another 008.

## Standing verification checklist (mandatory after every migration, either path)

This is the step that was missing and caused the 008 incident. Do not skip it, even when the push/apply step "looked" successful:

1. **Re-run the specific check the migration was meant to fix, against the live DB** — not the migration file, the actual database. For a constraint change, try an insert that should now succeed/fail. For an index, `EXPLAIN ANALYZE` a query that should use it. For an RLS policy, test with a real two-user setup (a service-role insert + a session-scoped read from a different user), the same way v0.19.0's RLS remediation was verified.
2. **Check Supabase's Security Advisor** (Dashboard → Advisors) after any RLS/policy/index change — it surfaces exactly the class of issue (missing RLS, overlapping policies, missing indexes on filtered/RLS'd columns) that this checklist exists to catch.
3. **Update `docs/brain/14_CHANGELOG.md` and `08_CURRENT_STATUS.md` only after step 1 confirms it's live** — not when the migration file is written, not when the push command exits 0. The 008 incident's changelog entry claimed success before verification; that's the exact mistake to not repeat.
4. **If the environment applying the migration has no CLI link and no DB access** (the common case for an unattended agent session in this project), the migration file should still be written and committed, but the changelog entry must say "written, not yet applied — needs founder to run via SQL editor or `supabase db push`" rather than claiming it's live. Flag it, don't assume it.

## Cross-references

- `12_DEPLOYMENT.md` — general deploy process, Railway/Vercel config.
- `14_CHANGELOG.md` v0.19.0 — the 008 incident writeup in full.
- `15_INGESTION_PIPELINE.md` — the pipeline that broke silently because of it.
