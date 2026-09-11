"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COMMODITIES, FOREX_PAIRS, REGIONS } from "@blue-beacon-research/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type MyPreferences = {
  commodities: string[];
  forexPairs: string[];
  regions: string[];
  onboardingCompletedAt: string | null;
  /**
   * True when the user has told us at least one commodity, currency pair, or
   * region to follow.
   */
  hasPreferences: boolean;
  /**
   * Persisted watchlist. `null` means the user has never saved one (first-visit
   * seed still runs). An empty array means they cleared the list — do not re-seed.
   */
  watchlistSymbols: string[] | null;
  watchlistSuggested: boolean;
};

const EMPTY: MyPreferences = {
  commodities: [],
  forexPairs: [],
  regions: [],
  onboardingCompletedAt: null,
  hasPreferences: false,
  watchlistSymbols: null,
  watchlistSuggested: false,
};

const KNOWN_COMMODITIES = new Set<string>(COMMODITIES.map((c) => c.symbol));
const KNOWN_FOREX_PAIRS = new Set<string>(FOREX_PAIRS.map((f) => f.symbol));
const KNOWN_REGIONS = new Set<string>(REGIONS.map((r) => r.id));
const KNOWN_WATCHLIST = new Set<string>([...KNOWN_COMMODITIES, ...KNOWN_FOREX_PAIRS]);

function parseWatchlistSymbols(raw: string[] | null | undefined): string[] | null {
  if (raw == null) return null;
  return raw.filter((s) => KNOWN_WATCHLIST.has(s));
}

/**
 * The current user's personalization preferences (#81), read straight from
 * user_preferences under RLS. Shared by the dashboard "My Feed" toggle and the
 * watchlist preference-aware defaults so they can't drift apart. Unknown /
 * retired symbols are filtered out against the shared constants.
 */
export function useMyPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["my-preferences"],
    queryFn: async (): Promise<MyPreferences> => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return EMPTY;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return EMPTY;

      const { data } = await supabase
        .from("user_preferences")
        .select(
          "commodities, forex_pairs, regions, onboarding_completed_at, watchlist_symbols, watchlist_suggested",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      const commodities = ((data?.commodities as string[] | null) ?? []).filter((s) =>
        KNOWN_COMMODITIES.has(s),
      );
      const forexPairs = ((data?.forex_pairs as string[] | null) ?? []).filter((s) =>
        KNOWN_FOREX_PAIRS.has(s),
      );
      const regions = ((data?.regions as string[] | null) ?? []).filter((s) =>
        KNOWN_REGIONS.has(s),
      );

      return {
        commodities,
        forexPairs,
        regions,
        onboardingCompletedAt:
          (data?.onboarding_completed_at as string | null) ?? null,
        hasPreferences:
          commodities.length > 0 || forexPairs.length > 0 || regions.length > 0,
        watchlistSymbols: parseWatchlistSymbols(
          data?.watchlist_symbols as string[] | null | undefined,
        ),
        watchlistSuggested: Boolean(data?.watchlist_suggested),
      };
    },
    staleTime: 5 * 60_000,
  });

  const persistWatchlist = useCallback(
    async (symbols: string[], suggested: boolean) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const nextSymbols = symbols.filter((s) => KNOWN_WATCHLIST.has(s));
      // onConflict: "user_id" — same constraint the onboarding upsert uses.
      // PK is `id`; naming user_id avoids a 409 for users who already have a row.
      const { error } = await supabase.from("user_preferences").upsert(
        {
          user_id: user.id,
          watchlist_symbols: nextSymbols,
          watchlist_suggested: suggested,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        console.error("watchlist persist failed", error.message);
        return;
      }

      queryClient.setQueryData<MyPreferences>(["my-preferences"], (old) =>
        old
          ? {
              ...old,
              watchlistSymbols: nextSymbols,
              watchlistSuggested: suggested,
            }
          : old,
      );
    },
    [queryClient],
  );

  return { ...query, persistWatchlist };
}
