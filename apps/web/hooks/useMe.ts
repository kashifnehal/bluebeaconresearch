"use client";

import { useEffect } from "react";
import { fetchMyProfile } from "@/lib/profile";
import { useAuthStore } from "@/store/useAuthStore";

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await fetchMyProfile();
      if (cancelled) return;
      if (!profile) {
        setUser(null, "free");
        return;
      }
      setUser(profile.id, profile.planTier);
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser]);
}

