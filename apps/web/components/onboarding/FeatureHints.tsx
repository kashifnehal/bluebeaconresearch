"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hints as createHints, type Hints } from "driver.js/hints";
import "driver.js/dist/hints.css";
import "./feature-hints.css";
import { useUIStore } from "@/store/useUIStore";
import {
  hintsForPathname,
  isHintSeen,
  markHintSeen,
  type FeatureHintDef,
} from "@/lib/feature-hints";

/**
 * One pulsing Driver.js Feature Hint per key control (not a multi-step tour).
 * Seen state is per-hint in localStorage (`bbr_hint_seen_<id>`), as specified —
 * per-browser, not synced to the account.
 */
export function FeatureHints() {
  const pathname = usePathname();
  const tourActive = useUIStore((s) => s.tourActive);
  const instanceRef = useRef<Hints | null>(null);
  const listenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let giveUpTimer: number | undefined;
    let observer: MutationObserver | undefined;

    const teardown = () => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      if (giveUpTimer !== undefined) window.clearTimeout(giveUpTimer);
      observer?.disconnect();
      listenersRef.current.forEach((off) => off());
      listenersRef.current = [];
      instanceRef.current?.hide();
      instanceRef.current = null;
    };

    if (tourActive) {
      teardown();
      return () => {
        cancelled = true;
        teardown();
      };
    }

    const tryShow = () => {
      if (cancelled) return;
      if (instanceRef.current?.isVisible()) return;

      const defs = hintsForPathname(pathname).filter((h) => !isHintSeen(h.id));
      if (defs.length === 0) return;

      const ready = defs.filter((h) => document.querySelector(h.selector));
      if (ready.length === 0) return;

      listenersRef.current.forEach((off) => off());
      listenersRef.current = [];
      instanceRef.current?.hide();
      instanceRef.current = null;
      mountHints(ready, instanceRef, listenersRef);
    };

    tryShow();
    retryTimer = window.setInterval(tryShow, 200);
    giveUpTimer = window.setTimeout(() => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
    }, 20_000);
    observer = new MutationObserver(tryShow);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      teardown();
    };
  }, [pathname, tourActive]);

  return null;
}

function mountHints(
  ready: FeatureHintDef[],
  instanceRef: { current: Hints | null },
  listenersRef: { current: Array<() => void> },
) {
  const instance = createHints({
    overlay: false,
    buttonText: "Got it",
    popoverClass: "bbr-feature-hint",
    beacon: { animate: true, side: "top", align: "end" },
    hints: ready.map((h) => ({
      id: h.id,
      element: h.selector,
      popover: {
        title: h.title,
        description: h.description,
        showButton: true,
        buttonText: "Got it",
      },
    })),
    onDismiss: (_element, hint) => {
      if (hint.id) markHintSeen(hint.id);
    },
  });

  instanceRef.current = instance;
  instance.show();

  for (const h of ready) {
    const el = document.querySelector(h.selector);
    if (!el) continue;
    const onClick = () => {
      markHintSeen(h.id);
      instance.dismiss(h.id);
    };
    el.addEventListener("click", onClick);
    listenersRef.current.push(() => el.removeEventListener("click", onClick));
  }
}
