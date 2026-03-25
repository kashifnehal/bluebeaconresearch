"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlanTier } from "@blue-beacon-research/shared";

type AuthState = {
  userId: string | null;
  planTier: PlanTier;
  setUser: (userId: string | null, planTier?: PlanTier) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      planTier: "pro",
      setUser: (userId, planTier) =>
        set({ userId, planTier: planTier ?? "pro" }),
    }),
    { name: "blue-beacon-auth" },
  ),
);
