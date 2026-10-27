import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/Breadcrumbs";

export const PAGE_TITLE_CLASS = "text-4xl font-extrabold tracking-tighter font-headline text-white";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs: BreadcrumbItem[];
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <>
      <Breadcrumbs items={breadcrumbs} className="mb-4" />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
          {description ? (
            <p className="text-on-surface/60 mt-2 font-body font-medium">{description}</p>
          ) : null}
          {meta}
        </div>
        {actions ? (
          <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </>
  );
}
