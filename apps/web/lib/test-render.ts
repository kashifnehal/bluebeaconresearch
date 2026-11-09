// Shared linkedom + react-dom/client harness for rendered component tests
// (same setup duplicated per-file in components/signals/SignalQuickView.test.tsx
// and components/layout/Sidebar.test.tsx) — factored out once here because
// TASK UI-ALL adds many new small presentational components that all need it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { parseHTML } from "linkedom";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

// Same minimal localStorage stand-in as components/layout/Sidebar.test.tsx —
// linkedom doesn't implement it, and zustand's persist middleware (useUIStore)
// and several pages' own localStorage reads need it to exist at all.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

let initialized = false;

/** Call once per test file/process — see the `initialized` guard below. */
export function setupDom(): Document {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  if (!initialized) {
    const g = globalThis as any;
    for (const key of [
      "window",
      "document",
      "HTMLElement",
      "Element",
      "Node",
      "DocumentFragment",
      "MutationObserver",
    ] as const) {
      Object.defineProperty(g, key, {
        value: key === "window" ? window : key === "document" ? document : (window as any)[key],
        configurable: true,
      });
    }
    const computed = () => ({
      getPropertyValue: () => "",
      contentVisibility: "visible",
      display: "block",
    });
    g.getComputedStyle = computed;
    (window as any).getComputedStyle = computed;
    const raf = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
    const caf = (id: number) => clearTimeout(id);
    g.requestAnimationFrame = raf;
    g.cancelAnimationFrame = caf;
    (window as any).requestAnimationFrame = raf;
    (window as any).cancelAnimationFrame = caf;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof g.self === "undefined") g.self = g;
    if (typeof (window as any).self === "undefined") (window as any).self = window;
    (window as any).localStorage = new MemoryStorage();
    (window as any).sessionStorage = new MemoryStorage();
    initialized = true;
  }
  return document;
}

export async function renderElement(
  document: Document,
  element: ReactElement,
): Promise<{ html: string; root: Root }> {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { html: document.body.innerHTML, root };
}

export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type SignedInAuthOptions = {
  userId?: string;
  email?: string;
  fullName?: string;
  /** Overrides merged onto the default profiles row (onboarding/tour done, pro plan). */
  profile?: Record<string, unknown>;
};

/**
 * Mocks the cached browser supabase client so components/auth/AuthProvider.tsx
 * resolves to a signed-in user with no network call, and stubs the
 * "user_preferences" table to the same empty-row shape hooks/useMyPreferences.ts's
 * EMPTY fallback already produced. Needed by any rendered test for a dashboard
 * page/component that calls useAuth() or useMyPreferences() — as of TASK W-AUTH
 * and TASK W2-AUTH, both require a real <AuthProvider> ancestor instead of
 * their own supabase.auth.getUser() call, and every page is always rendered
 * inside one in production (mounted once, at the root, in app/providers.tsx),
 * so a test rendering the bare component needs to reconstruct that same
 * ancestor.
 */
export async function setupSignedInSupabase(document: Document, options: SignedInAuthOptions = {}) {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  // @supabase/ssr's browser client reads document.cookie on construction —
  // linkedom doesn't implement it.
  if (typeof document.cookie !== "string") {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }

  const { getSupabaseBrowserClient } = await import("./supabase");
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("browser client was not created");

  const userId = options.userId ?? "user-1";
  const fullName = options.fullName ?? "Ada Lovelace";
  const user = {
    id: userId,
    email: options.email ?? "ada@example.com",
    user_metadata: { full_name: fullName },
  } as any;
  const session = { user, access_token: "tok", refresh_token: "rtok" } as any;

  client.auth.getSession = (async () => ({
    data: { session },
    error: null,
  })) as typeof client.auth.getSession;
  client.auth.getUser = (async () => ({
    data: { user },
    error: null,
  })) as typeof client.auth.getUser;
  client.auth.onAuthStateChange = ((_callback: (event: string, session: unknown) => void) => ({
    data: { subscription: { unsubscribe() {} } },
  })) as typeof client.auth.onAuthStateChange;

  function makeQueryBuilder(result: { data: unknown; error: unknown }) {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => result,
      upsert: async () => result,
      update: () => builder,
    };
    return builder;
  }
  const profileRow = {
    id: userId,
    onboarding_completed: true,
    product_tour_completed: true,
    plan_tier: "pro",
    full_name: fullName,
    ...options.profile,
  };
  client.from = ((table: string) => {
    if (table === "profiles") return makeQueryBuilder({ data: profileRow, error: null });
    // No saved row — matches useMyPreferences.ts's own EMPTY fallback shape.
    if (table === "user_preferences") return makeQueryBuilder({ data: null, error: null });
    throw new Error(`setupSignedInSupabase: no stub for supabase.from("${table}")`);
  }) as typeof client.from;

  return { client, user };
}
