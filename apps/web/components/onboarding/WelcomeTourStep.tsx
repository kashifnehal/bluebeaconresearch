"use client";

import { useState } from "react";

export const WELCOME_DEMO_SRC = "/onboarding/welcome-demo.gif";

function isVideoSrc(src: string) {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(src);
}

function WelcomeDemoMedia({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const video = isVideoSrc(src);

  if (failed) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center border border-[#3c4a42] bg-[#1c1b1b] text-center text-sm text-[#86948a]"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Demo preview coming soon
      </div>
    );
  }

  if (video) {
    return (
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setFailed(true)}
        className="aspect-video w-full border border-[#3c4a42] object-cover bg-[#1c1b1b]"
      />
    );
  }

  return (
    // Placeholder path until the recorded asset ships. <img> for gif; swap
    // WELCOME_DEMO_SRC to an mp4 to get looping muted autoplay <video>.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="aspect-video w-full border border-[#3c4a42] object-cover bg-[#1c1b1b]"
    />
  );
}

export function WelcomeTourStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-caption"
      data-testid="welcome-tour-step"
    >
      <div className="fixed inset-0 bg-black/78" />
      <div
        className="relative z-[10001] w-full max-w-xl border border-[#3c4a42] bg-[#131313] p-6 text-[#e5e2e1] shadow-2xl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <WelcomeDemoMedia src={WELCOME_DEMO_SRC} />
        <p
          id="welcome-tour-caption"
          className="mt-4 text-base font-semibold"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          See how it works
        </p>
        <div className="mt-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-[11px] font-bold text-[#86948a] underline"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="bg-[#4edea3] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#003824]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Got it, show me around
          </button>
        </div>
      </div>
    </div>
  );
}
