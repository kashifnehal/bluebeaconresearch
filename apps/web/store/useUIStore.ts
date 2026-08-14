"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UIState = {
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // Search submitted via Enter key for server-side search
  searchSubmitted: string | null;
  setSearchSubmitted: (q: string | null) => void;

  notifOpen: boolean;
  setNotifOpen: (open: boolean) => void;

  unreadCount: number;
  setUnreadCount: (count: number) => void;
  resetUnread: () => void;

  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      compactMode: false,
      setCompactMode: (v) => set({ compactMode: v }),

      searchQuery: "",
      setSearchQuery: (q) => set({ searchQuery: q }),
      searchSubmitted: null,
      setSearchSubmitted: (q) => set({ searchSubmitted: q }),

      notifOpen: false,
      setNotifOpen: (open) => set({ notifOpen: open }),

      unreadCount: 0,
      setUnreadCount: (count) => set({ unreadCount: count }),
      resetUnread: () => set({ unreadCount: 0 }),

      helpOpen: false,
      setHelpOpen: (open) => set({ helpOpen: open }),
    }),
    { name: "blue-beacon-ui" },
  ),
);
