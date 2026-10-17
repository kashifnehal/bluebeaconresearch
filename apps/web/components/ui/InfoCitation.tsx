"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small "i" button next to a number, opening a short explanation in plain
 * language. A press inside the popover does not bubble, so a parent hover
 * card stays open. Escape and a press outside still close the popover.
 */
export function InfoCitation({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label={`How "${label}" is calculated`}
        aria-expanded={open}
        data-testid="info-citation-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-on-surface-variant/50 text-[9px] leading-none text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          data-testid="info-citation-popover"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="absolute bottom-full left-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-md border border-outline-variant/40 bg-[#141414] p-2.5 text-left text-[10px] font-mono normal-case leading-snug text-on-surface-variant shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
