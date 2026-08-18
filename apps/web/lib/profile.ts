"use client";

import type { PlanTier } from "@blue-beacon-research/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { isProjectReady } from "@/lib/flags";

export type Profile = {
  id: string;
  onboardingCompleted: boolean;
  productTourCompleted: boolean;
  planTier: PlanTier;
  fullName?: string | null;
};

type ProfileRow = {
  id: string;
  onboarding_completed: boolean | null;
  product_tour_completed: boolean | null;
  plan_tier: PlanTier | null;
  full_name: string | null;
};

export async function fetchMyProfile(): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, onboarding_completed, product_tour_completed, plan_tier, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const row = (data ?? null) as ProfileRow | null;

  return {
    id: user.id,
    onboardingCompleted: Boolean(row?.onboarding_completed),
    productTourCompleted: Boolean(row?.product_tour_completed),
    planTier: (row?.plan_tier ?? "free") as PlanTier,
    fullName: row?.full_name ?? null,
  };
}

// Shared by every post-auth flow (login, password reset) that needs to land the
// user on the right page via window.location.href. Single source of truth so the
// destination logic can't drift between callers.
export function resolvePostAuthRedirect(profile: Profile | null): string {
  if (!isProjectReady) return "/";
  return profile?.onboardingCompleted ? "/dashboard" : "/onboarding";
}

