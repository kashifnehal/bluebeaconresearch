"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAuthStore } from "@/store/useAuthStore";

// Reads the already-resolved AuthProvider context instead of calling
// supabase.auth.getUser() itself (TASK W2-AUTH Part 1) — AuthProvider is the
// one place a page load's single getSession()/getUser() round trip happens.
export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const { profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!profile) {
      setUser(null, "free");
      return;
    }
    setUser(profile.id, profile.planTier);
  }, [isLoading, profile, setUser]);
}
