"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UIState = {
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      compactMode: false,
      setCompactMode: (v) => set({ compactMode: v }),
    }),
    { name: "geosignal-ui" },
  ),
);

