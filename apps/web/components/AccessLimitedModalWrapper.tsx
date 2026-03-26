"use client";

import { useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";
import AccessLimitedModal from "@/components/AccessLimitedModal";

function ModalInner() {
  const params = useSearchParams();
  const pathname = usePathname();

  // Do not show the modal on the signup page
  if (pathname === "/signup") {
    return null;
  }

  const joinedWaitlist = params.get("joined") === "1";
  return <AccessLimitedModal joinedWaitlist={joinedWaitlist} />;
}

/**
 * Thin client wrapper for AccessLimitedModal.
 * useSearchParams() requires Suspense in Next.js 13+.
 */
export default function AccessLimitedModalWrapper() {
  return (
    <Suspense fallback={null}>
      <ModalInner />
    </Suspense>
  );
}
