"use client";

import type { PlanTier } from "@geosignal/shared";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type Profile = {
  id: string;
  onboardingCompleted: boolean;
  planTier: PlanTier;
  fullName?: string | null;
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

  return {
    id: user.id,
    onboardingCompleted: Boolean((data as any)?.onboarding_completed),
    planTier: ((data as any)?.plan_tier ?? "free") as PlanTier,
    fullName: (data as any)?.full_name ?? null,
  };
}

