// Shared between apps/web/app/api/signals/[id]/route.ts (server) and
// apps/web/app/(dashboard)/events/[id]/page.tsx (client) — kept in its own
// module, rather than re-exported from the route file, because the route
// file imports @/lib/supabase-server (which pulls in next/headers); a client
// component importing a runtime value from that file would bundle the whole
// server-only chain. Initial on-page display count, not a query cap — a
// display choice, not a sourced threshold (audit #276: the old `.limit(50)`
// candidate query plus `.slice(0, 10)` display cut candidates off before
// scoring *and* hid how many real matches existed beyond the first page, with
// no indicator). The candidate query itself is unbounded now; this constant
// only controls how many of the real, fully-scored matches render per
// "Load more" step.
export const RELATED_EVENTS_PAGE_SIZE = 50;
