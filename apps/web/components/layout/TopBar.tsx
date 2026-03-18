"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function titleFor(pathname: string) {
  if (pathname.startsWith("/watchlist")) return "Watchlist";
  if (pathname.startsWith("/alerts")) return "Alerts";
  if (pathname.startsWith("/backtesting")) return "Backtesting";
  if (pathname.startsWith("/api-console")) return "API Console";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/events")) return "Event";
  return "Signal Feed";
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const title = useMemo(() => titleFor(pathname), [pathname]);

  return (
    <div className="sticky top-0 z-40 h-14 bg-surface border-b border-border flex items-center px-4 lg:ml-[240px]">
      <div className="text-text-primary text-[18px] font-semibold">{title}</div>

      <div className="mx-auto hidden md:block">
        <div className="relative w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <Input
            placeholder="Search events, countries, commodities..."
            className="h-9 pl-10 bg-surface-secondary border-border text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:border-accent"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          className="h-9 w-9 p-0 bg-transparent border-border hover:bg-surface-elevated"
          onClick={() => {}}
          aria-label="Notifications"
        >
          <Bell size={18} />
        </Button>

        <Button
          variant="outline"
          className="h-9 w-9 p-0 bg-transparent border-border hover:bg-surface-elevated"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="size-9 rounded-full bg-accent text-white text-sm font-semibold">
            GS
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-surface border-border">
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/login")}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

