"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchProfileForUser, type Profile } from "@/lib/profile";

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
 * One sign-in check per dashboard page load. Calls getSession() once (reads
 * local storage, no network) instead of the getUser() every dashboard
 * component used to call on its own mount, subscribes to onAuthStateChange
 * for sign-out/token-refresh, and loads the profile row once per signed-in
 * user id. getUser() stays server-side (proxy.ts, route handlers) where the
 * trust boundary actually requires asking the Auth server.
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
      const profile = await fetchProfileForUser(supabase, user);
      if (!cancelled) setState({ user, session, profile, isLoading: false });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) void resolveSession(session);
    });

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
