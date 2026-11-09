"use client";

import { useEffect, useState } from "react";

/**
 * Tracks document.visibilityState so polling hooks can pause while a tab is
 * hidden instead of burning fetches no one can see. react-query's default
 * refetchOnWindowFocus already covers "refresh once when the tab becomes
 * visible again" — this hook only needs to drive the pause.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}
