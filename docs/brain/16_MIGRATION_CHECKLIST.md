# 16_MIGRATION_CHECKLIST.md — Schema Deploy Process & Standing Verification Checklist

Added 2026-08-18 (commit `97b7c4b` era, this file lands in the next commit) — Reliability/DB-cleanup pass.

## Why this file exists

Every schema change in this project has, until now, been hand-applied via the Supabase SQL editor — no CLI link, no automated push, no verification step baked into the process. This already caused a real incident: `migrations/008_fix_source_constraint.sql` was written, committed, and the changelog (`14_CHANGELOG.md` v0.17.0) recorded it as applied — but it had in fact never been run against the live database. For two days, the GNews collector silently failed every single insert because of it. It was only caught by accident, as a side effect of unrelated RLS verification work (v0.19.0). "Committed" and "live" silently diverged, and nothing would have caught it if that unrelated session hadn't happened to touch the same table.

This is exactly the same failure shape as the alert-pipeline bug fixed 2026-08-18 (v0.20.0): a thing that *looked* done because the code/docs said so, but was never actually verified against reality.

## The real fix: CLI-linked migrations (scaffolded, not yet linked)

`supabase/config.toml` now exists (`supabase init` was run 2026-08-18) — the project is CLI-ready. **It is not yet linked to the live project**, because linking requires an interactive `supabase login` or a `SUPABASE_ACCESS_TOKEN`, neither of which is available in an unattended agent environment. This is a decision point for whoever has interactive access (founder), not something that could be resolved unilaterally.

**One-time setup (founder, interactive):**
```bash
npx supabase login                                    # opens a browser, generates an access token
npx supabase link --project-ref evavcgfmemwryggdkjmx   # links this repo to the live project
```

**Going forward, every schema change should be:**
```bash
# 1. Write the migration as a new numbered file in supabase/migrations/
#    (e.g. 012_whatever.sql — follow the existing 000-011 numbering)

# 2. Push it to the live project
npx supabase db push

# 3. Verify it actually applied — don't trust the push command's exit code alone,
#    the 008 incident happened with a migration that *looked* fine
npx supabase db diff --linked   # should show no drift between migrations/ and live schema
```

If `supabase db push` isn't set up yet (link step above still pending), migrations continue to go through the Supabase SQL editor manually — but the verification step below is mandatory regardless of which path was used to apply them.

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
