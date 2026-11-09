"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isAuthError, isAuthSessionMissingError, type Session, type User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchProfileForUser, type Profile } from "@/lib/profile";

// Short fixed backoff between retries — not exponential, since these are
// retrying a single page load's auth check, not a long-running job.
const PROFILE_FETCH_MAX_ATTEMPTS = 3;
const PROFILE_FETCH_RETRY_DELAY_MS = 300;
const SESSION_OUTAGE_RETRY_DELAY_MS = 500;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Any Auth-server failure that isn't "there's definitely no session" — a 5xx,
// a network blip, or a non-JSON (HTML) response wrapped as AuthUnknownError —
// means the Auth backend is temporarily unreachable, not that this session is
// actually invalid (the 2026-11-09 Cloudflare 522 incident: GoTrue's own fetch
// handling throws AuthUnknownError when a non-2xx response body isn't valid
// JSON — see @supabase/auth-js's handleError()).
function isAuthOutageError(err: unknown): boolean {
  if (isAuthSessionMissingError(err)) return false;
  return isAuthError(err);
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
};

const DEFAULT_VALUE: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
};

const AuthContext = createContext<AuthContextValue>(DEFAULT_VALUE);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * One sign-in check per page load. Mounted once at the root (app/providers.tsx).
 * Calls getSession() once (reads local storage, no network, except a token
 * refresh) instead of the getUser() every page/component used to call on its
 * own mount, subscribes to onAuthStateChange for sign-out/token-refresh, and
 * loads the profile row once per signed-in user id, retrying a failed profile
 * fetch up to 3 times. getUser() stays server-side (proxy.ts, route handlers,
 * and lib/profile.ts's fetchMyProfile() right after a sign-in action) where
 * the trust boundary actually requires asking the Auth server. A getSession()
 * failure that looks like an Auth-backend outage (5xx, non-JSON response)
 * retries once rather than showing an error or clearing the session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextValue>(DEFAULT_VALUE);
  const profileLoadedForUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const browserClient = getSupabaseBrowserClient();
    if (!browserClient) {
      setState({ user: null, session: null, profile: null, isLoading: false });
      return;
    }
    // Reassigning to a new const (rather than narrowing `browserClient` itself)
    // keeps TypeScript's null-check narrowing valid inside resolveSession below.
    const supabase = browserClient;

    async function resolveSession(session: Session | null) {
      const user = session?.user ?? null;
      if (!user) {
        profileLoadedForUserId.current = null;
        if (!cancelled) setState({ user: null, session: null, profile: null, isLoading: false });
        return;
      }
      if (profileLoadedForUserId.current === user.id) {
        if (!cancelled) setState((s) => ({ ...s, user, session, isLoading: false }));
        return;
      }
      profileLoadedForUserId.current = user.id;

      let profile: Profile | null = null;
      for (let attempt = 1; attempt <= PROFILE_FETCH_MAX_ATTEMPTS; attempt++) {
        try {
          profile = await fetchProfileForUser(supabase, user);
          break;
        } catch {
          // A failed fetch left the ref set, so a later auth event (a token
          // refresh, another tab's sign-in) would see profileLoadedForUserId
          // already matching this user id and skip retrying entirely — clear
          // it so this attempt, or a later one, can actually retry.
          profileLoadedForUserId.current = null;
          if (attempt === PROFILE_FETCH_MAX_ATTEMPTS || cancelled) break;
          await wait(PROFILE_FETCH_RETRY_DELAY_MS);
          if (cancelled) break;
          profileLoadedForUserId.current = user.id;
        }
      }
      if (!cancelled) setState({ user, session, profile, isLoading: false });
    }

    // A 5xx/HTML ("outage") getSession() failure is not evidence this user's
    // session is invalid — retry once after a short delay instead of showing
    // a vendor error or clearing whatever's already in state. GAP: this does
    // not fix, or prove, the underlying cause of the outage (a Cloudflare
    // Worker auth proxy or Supabase Auth compute issue) — only that a
    // transient failure here no longer reaches the screen or signs anyone out.
    async function loadInitialSession(isRetry = false) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) await resolveSession(session);
      } catch (err) {
        if (cancelled) return;
        if (isAuthOutageError(err) && !isRetry) {
          await wait(SESSION_OUTAGE_RETRY_DELAY_MS);
          if (!cancelled) await loadInitialSession(true);
          return;
        }
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
      }
    }

    void loadInitialSession();

    // gotrue-js fires INITIAL_SESSION on subscribe with the same session the
    // getSession() call above already resolved — skip it to avoid a second
    // (redundant) profile fetch and render.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || cancelled) return;
      void resolveSession(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
