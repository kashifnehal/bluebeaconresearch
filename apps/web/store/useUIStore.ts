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

  // Mobile off-canvas sidebar (below md). Persisted with the rest of this
  // store — cheaper than adding a partialize exception for one field.
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;

  // Header + contextual Telegram-connect modal (#112). Same store as Help
  // so TopBar and the signal-view prompt can open the same surface.
  notificationConnectOpen: boolean;
  setNotificationConnectOpen: (open: boolean) => void;

  // Session-only count of signal-detail mounts. Excluded from persist so a
  // fresh page load resets to 0 (the intended "this session" behavior).
  signalsViewedThisSession: number;
  incrementSignalsViewed: () => void;

  // Product tour (react-joyride). Lives here (not local component state)
  // because the tour spans a dashboard->event-page navigation, and this
  // store is mounted once in the shared (dashboard) layout.
  tourActive: boolean;
  tourPhase: "welcome" | "dashboard" | "event";
  tourStepIndex: number;
  tourEventId: string | null;
  startTour: () => void;
  endTour: () => void;
  setTourPhase: (phase: "welcome" | "dashboard" | "event") => void;
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

      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

      notificationConnectOpen: false,
      setNotificationConnectOpen: (open) => set({ notificationConnectOpen: open }),

      signalsViewedThisSession: 0,
      incrementSignalsViewed: () =>
        set((s) => ({ signalsViewedThisSession: s.signalsViewedThisSession + 1 })),

      tourActive: false,
      tourPhase: "welcome",
      tourStepIndex: 0,
      tourEventId: null,
      startTour: () =>
        set({ tourActive: true, tourPhase: "welcome", tourStepIndex: 0, tourEventId: null }),
      endTour: () =>
        set({ tourActive: false, tourPhase: "welcome", tourStepIndex: 0, tourEventId: null }),
      setTourPhase: (phase) => set({ tourPhase: phase }),
      setTourStepIndex: (index) => set({ tourStepIndex: index }),
      setTourEventId: (id) => set({ tourEventId: id }),
    }),
    {
      name: "blue-beacon-ui",
      partialize: (state) => {
        const { signalsViewedThisSession, ...persisted } = state;
        return persisted;
      },
    },
  ),
);
