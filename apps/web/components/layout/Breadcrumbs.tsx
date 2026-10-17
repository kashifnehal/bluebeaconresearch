"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({
  items,
  className = "",
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      data-testid="breadcrumbs"
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 overflow-hidden text-[12px] md:text-[10px] font-black uppercase tracking-widest ${className}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span
            key={`${item.label}-${i}`}
            className={`flex items-center gap-1.5 ${isLast ? "min-w-0" : "shrink-0"}`}
          >
            {i > 0 ? (
              <ChevronRight size={12} className="shrink-0 text-muted" />
            ) : null}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted hover:text-accent transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={`truncate ${isLast ? "text-text-primary" : "text-muted"}`}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
