"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useMe();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="dark"
        forcedTheme="dark"
        disableTransitionOnChange
      >
        <TooltipProvider>
          {children}
          <Toaster richColors theme="dark" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

