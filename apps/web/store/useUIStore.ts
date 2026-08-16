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

  // Product tour (react-joyride). Lives here (not local component state)
  // because the tour spans a dashboard->event-page navigation, and this
  // store is mounted once in the shared (dashboard) layout.
  tourActive: boolean;
  tourPhase: "dashboard" | "event";
  tourStepIndex: number;
  tourEventId: string | null;
  startTour: () => void;
  endTour: () => void;
  setTourPhase: (phase: "dashboard" | "event") => void;
  setTourStepIndex: (index: number) => void;
  setTourEventId: (id: string | null) => void;
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

      tourActive: false,
      tourPhase: "dashboard",
      tourStepIndex: 0,
      tourEventId: null,
      startTour: () =>
        set({ tourActive: true, tourPhase: "dashboard", tourStepIndex: 0, tourEventId: null }),
      endTour: () =>
        set({ tourActive: false, tourPhase: "dashboard", tourStepIndex: 0, tourEventId: null }),
      setTourPhase: (phase) => set({ tourPhase: phase }),
      setTourStepIndex: (index) => set({ tourStepIndex: index }),
      setTourEventId: (id) => set({ tourEventId: id }),
    }),
    { name: "blue-beacon-ui" },
  ),
);
