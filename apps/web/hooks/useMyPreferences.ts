"use client";

import { useQuery } from "@tanstack/react-query";
import { COMMODITIES, REGIONS } from "@blue-beacon-research/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type MyPreferences = {
  commodities: string[];
  regions: string[];
  onboardingCompletedAt: string | null;
  /** True when the user has told us at least one commodity or region to follow. */
  hasPreferences: boolean;
};

const EMPTY: MyPreferences = {
  commodities: [],
  regions: [],
  onboardingCompletedAt: null,
  hasPreferences: false,
};

const KNOWN_COMMODITIES = new Set<string>(COMMODITIES.map((c) => c.symbol));
const KNOWN_REGIONS = new Set<string>(REGIONS.map((r) => r.id));

/**
 * The current user's personalization preferences (#81), read straight from
 * user_preferences under RLS. Shared by the dashboard "My Feed" toggle and the
 * watchlist preference-aware defaults so they can't drift apart. Unknown /
 * retired symbols are filtered out against the shared constants.
 */
export function useMyPreferences() {
  return useQuery({
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
        .select("commodities, regions, onboarding_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const commodities = ((data?.commodities as string[] | null) ?? []).filter((s) =>
        KNOWN_COMMODITIES.has(s),
      );
      const regions = ((data?.regions as string[] | null) ?? []).filter((s) =>
        KNOWN_REGIONS.has(s),
      );

      return {
        commodities,
        regions,
        onboardingCompletedAt:
          (data?.onboarding_completed_at as string | null) ?? null,
        hasPreferences: commodities.length > 0 || regions.length > 0,
      };
    },
    staleTime: 5 * 60_000,
  });
}
