"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { FirstTouchCapture } from "@/components/FirstTouchCapture";
import { ConsentBanner } from "@/components/ConsentBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { useMe } from "@/hooks/useMe";
import { initAnalytics } from "@/lib/analytics";

// Syncs useAuthStore from AuthProvider's context. A separate component (not
// called inline in Providers) because useMe() needs to be a descendant of
// <AuthProvider> to read its context.
function AuthStoreSync() {
  useMe();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => {
    initAnalytics();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthStoreSync />
        <TooltipProvider>
          <FirstTouchCapture />
          <ConsentBanner />
          {children}
          <Toaster richColors theme="dark" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

