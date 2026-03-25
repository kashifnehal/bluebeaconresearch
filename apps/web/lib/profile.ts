"use client";

import type { PlanTier } from "@blue-beacon-research/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type Profile = {
  id: string;
  onboardingCompleted: boolean;
  planTier: PlanTier;
  fullName?: string | null;
};

type ProfileRow = {
  id: string;
  onboarding_completed: boolean | null;
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
    .select("id, onboarding_completed, plan_tier, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const row = (data ?? null) as ProfileRow | null;

  return {
    id: user.id,
    onboardingCompleted: Boolean(row?.onboarding_completed),
    planTier: (row?.plan_tier ?? "free") as PlanTier,
    fullName: row?.full_name ?? null,
  };
}

