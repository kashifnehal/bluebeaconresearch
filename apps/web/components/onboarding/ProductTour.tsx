"use client";

import { useEffect, useState } from "react";
import Joyride, { type CallBackProps, type Step, STATUS } from "react-joyride";
import { usePathname, useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const DASHBOARD_STEPS: Step[] = [
  {
    target: '[data-tour="feed-header"]',
    content:
      "This is your live signal feed. New geopolitical and macro events that could affect markets you care about show up here as they're confirmed.",
    disableBeacon: true,
    placement: "bottom",
  },
  {
    target: '[data-tour="severity-badge"]',
    content:
      "Severity 1-10 tells you how market-relevant this is. 8+ is the kind of thing that moves markets before you hear about it elsewhere.",
    placement: "bottom",
  },
  {
    target: '[data-tour="confidence-score"]',
    content:
      "Confidence reflects how many independent sources have confirmed this and how directly it maps to a market outcome — not a guess dressed up as a number.",
    placement: "bottom",
  },
  {
    target: '[data-tour="analyze-impact"]',
    content:
      "Every signal has a full breakdown: what happened, what it affects, and the evidence behind it. This is where you decide if it matters to your positions.",
    placement: "top",
  },
];

const EVENT_STEPS: Step[] = [
  {
    target: '[data-tour="set-alert"]',
    content:
      "Turn any signal type into a standing rule — get notified automatically next time something like this happens, without checking back manually.",
    disableBeacon: true,
    placement: "left",
  },
  {
    target: '[data-tour="sidebar-nav"]',
    content:
      "On Watchlist, click into any commodity to see its price charted against the events that moved it. You can also see global risk concentration on the Map, and test how past events like this one moved markets in Backtesting.",
    placement: "right",
  },
];

const TOUR_STYLES = {
  options: {
    arrowColor: "#131313",
    backgroundColor: "#131313",
    overlayColor: "rgba(14,14,14,0.78)",
    primaryColor: "#4edea3",
    textColor: "#e5e2e1",
    zIndex: 10000,
  },
  tooltip: {
    fontFamily: "'Inter', sans-serif",
    borderRadius: 0,
    border: "1px solid #3c4a42",
  },
  tooltipTitle: { fontFamily: "'Space Grotesk', sans-serif" },
  buttonNext: {
    backgroundColor: "#4edea3",
    color: "#003824",
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: "11px",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    borderRadius: 0,
    padding: "8px 16px",
  },
  buttonBack: {
    color: "#86948a",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "11px",
  },
  buttonSkip: {
    color: "#86948a",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "11px",
    fontWeight: 700,
    textDecoration: "underline",
  },
};

async function markTourCompleted() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ product_tour_completed: true }).eq("id", user.id);
}

export function ProductTour() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    tourActive,
    tourPhase,
    tourStepIndex,
    tourEventId,
    setTourPhase,
    setTourStepIndex,
    endTour,
  } = useUIStore();

  const onDashboard = pathname === "/dashboard";
  const onTargetEvent = Boolean(tourEventId) && pathname === `/events/${tourEventId}`;
  const onCorrectRoute =
    tourActive && ((tourPhase === "dashboard" && onDashboard) || (tourPhase === "event" && onTargetEvent));

  const steps = tourPhase === "dashboard" ? DASHBOARD_STEPS : EVENT_STEPS;

  // The event page's first target (the alert button) only exists once its
  // async signal fetch resolves — mounting Joyride before then means it
  // can't find the target and silently no-ops. Wait for the first step's
  // target to actually be in the DOM before letting it run.
  const [targetReady, setTargetReady] = useState(false);
  useEffect(() => {
    setTargetReady(false);
    if (!onCorrectRoute) return;
    const selector = steps[0]?.target as string;
    if (!selector) return;
    if (document.querySelector(selector)) {
      setTargetReady(true);
      return;
    }
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (document.querySelector(selector)) {
        setTargetReady(true);
        clearInterval(interval);
      }
    }, 150);
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCorrectRoute, tourPhase]);

  const shouldRun = onCorrectRoute && targetReady;

  function handleCallback(data: CallBackProps) {
    const { status, action, index, type } = data;

    if (status === STATUS.SKIPPED) {
      endTour();
      void markTourCompleted();
      return;
    }

    if (status === STATUS.FINISHED) {
      if (tourPhase === "dashboard" && tourEventId) {
        // Hand off to the event-detail phase — same explicit skippable tour,
        // continuing across the one navigation this feature is scoped to.
        setTourPhase("event");
        setTourStepIndex(0);
        router.push(`/events/${tourEventId}`);
      } else {
        endTour();
        void markTourCompleted();
      }
      return;
    }

    if (type === "step:after") {
      if (action === "next") setTourStepIndex(index + 1);
      else if (action === "prev") setTourStepIndex(Math.max(0, index - 1));
    }
  }

  if (!shouldRun) return null;

  return (
    <Joyride
      steps={steps}
      run={shouldRun}
      stepIndex={tourStepIndex}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      spotlightClicks={false}
      locale={{ skip: "Skip", next: "Next", back: "Back", last: "Done" }}
      callback={handleCallback}
      styles={TOUR_STYLES}
    />
  );
}
