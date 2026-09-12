"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const C = {
  backdrop: "rgba(0,0,0,0.85)",
  card: "#191c1a",
  border: "#2a3530",
  borderGlow: "#4edea3",
  heading: "#ffffff",
  bodyText: "#c8d5cc",
  italicText: "#a0b0a6",
  ctaText: "#4edea3",
  btnBg: "#4edea3",
  btnText: "#003824",
  btnHover: "#6ffbbe",
  metaText: "#3d5248",
  signInLink: "#4edea3",
  footerText: "#8a9e93",
};

interface AccessLimitedModalProps {
  joinedWaitlist?: boolean;
  variant?: "fullscreen" | "embedded";
  title?: string;
  body?: string;
  italic?: string;
  ctaLabel?: string;
  hideCta?: boolean;
}

export default function AccessLimitedModal({
  joinedWaitlist = false,
  variant = "fullscreen",
  title = "Access Limited",
  body = "Only the first 1000 users are being onboarded in this phase.",
  italic = "We are expanding our research capacity to maintain signal quality and accuracy.",
  ctaLabel,
  hideCta = false,
}: AccessLimitedModalProps) {
  const isEmbedded = variant === "embedded";
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  // Lock scroll and block Escape key (fullscreen waitlist gate only).
  useEffect(() => {
    if (isEmbedded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const blockEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", blockEscape, { capture: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", blockEscape, { capture: true });
    };
  }, [isEmbedded]);

  // MutationObserver: re-insert modal if DevTools removes or hides it
  useEffect(() => {
    if (isEmbedded) return;
    const modalNode = modalRef.current;
    if (!modalNode) return;

    const parentNode = modalNode.parentElement;
    if (!parentNode) return;

    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Node was removed – re-append it
        if (mutation.type === "childList") {
          for (const removed of mutation.removedNodes) {
            if (removed === modalNode) {
              parentNode.appendChild(modalNode);
              return;
            }
          }
        }
        // Style/attribute was changed (e.g. display:none)
        if (mutation.type === "attributes" && mutation.target === modalNode) {
          const el = modalNode as HTMLElement;
          if (
            el.style.display === "none" ||
            el.style.visibility === "hidden" ||
            el.style.opacity === "0" ||
            el.getAttribute("hidden") !== null
          ) {
            el.style.display = "flex";
            el.style.visibility = "visible";
            el.style.opacity = "1";
            el.removeAttribute("hidden");
          }
        }
      }
    });

    // Watch for child-list changes on the parent AND attribute changes on the modal itself
    observerRef.current.observe(parentNode, { childList: true });
    observerRef.current.observe(modalNode, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    return () => observerRef.current?.disconnect();
  }, [isEmbedded]);

  function handleJoinWaitlist() {
    router.push("/signup");
  }

  return (
    <div
      id="access-limited-modal"
      ref={modalRef}
      data-testid={isEmbedded ? "chat-early-access-blocker" : undefined}
      style={{
        position: isEmbedded ? "relative" : "fixed",
        inset: isEmbedded ? undefined : 0,
        zIndex: isEmbedded ? undefined : 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isEmbedded ? "transparent" : C.backdrop,
        backdropFilter: isEmbedded ? undefined : "blur(4px)",
        WebkitBackdropFilter: isEmbedded ? undefined : "blur(4px)",
        padding: isEmbedded ? "8px 0" : "24px",
        pointerEvents: "all",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Card */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "360px",
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: "4px",
          padding: "36px 32px 24px",
          boxShadow: `0 0 0 1px ${C.border}, 0 0 40px rgba(78,222,163,0.08)`,
          overflow: "hidden",
        }}
      >
        {/* Top accent border */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background: `linear-gradient(90deg, transparent 0%, ${C.borderGlow} 50%, transparent 100%)`,
          }}
        />

        {/* Corner decorations */}
        <div style={{ position: "absolute", top: "12px", left: "12px", width: "8px", height: "8px", borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}` }} />
        <div style={{ position: "absolute", top: "12px", right: "12px", width: "8px", height: "8px", borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }} />
        <div style={{ position: "absolute", bottom: "12px", left: "12px", width: "8px", height: "8px", borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}` }} />
        <div style={{ position: "absolute", bottom: "12px", right: "12px", width: "8px", height: "8px", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }} />

        {/* Heading */}
        <h1
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            fontSize: "22px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: C.heading,
            textAlign: "center",
            margin: "0 0 20px",
          }}
        >
          {title}
        </h1>

        {/* Body text */}
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "13.5px",
            lineHeight: "1.6",
            color: C.bodyText,
            textAlign: "center",
            margin: "0 0 12px",
          }}
        >
          {body}
        </p>

        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontStyle: "italic",
            fontSize: "13px",
            lineHeight: "1.6",
            color: C.italicText,
            textAlign: "center",
            margin: "0 0 20px",
          }}
        >
          {italic}
        </p>

        {!hideCta && (
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "12px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: C.ctaText,
            textAlign: "center",
            margin: "0 0 24px",
            lineHeight: "1.5",
          }}
        >
          Join the waitlist and get early access as soon as new slots open.
        </p>
        )}

        {/* Join Waitlist Button */}
        {!hideCta && (
        <button
          id="access-modal-join-btn"
          onClick={joinedWaitlist || isEmbedded ? undefined : handleJoinWaitlist}
          disabled={joinedWaitlist || isEmbedded}
          style={{
            width: "100%",
            backgroundColor: joinedWaitlist ? "rgba(78,222,163,0.35)" : C.btnBg,
            border: `1px solid ${C.btnBg}`,
            color: joinedWaitlist ? C.btnBg : C.btnText,
            padding: "14px",
            borderRadius: "3px",
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            fontSize: "13px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: joinedWaitlist ? "default" : "pointer",
            transition: "all 0.15s ease",
            marginBottom: "24px",
            display: "block",
          }}
          onMouseEnter={(e) => {
            if (!joinedWaitlist) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.btnHover;
            }
          }}
          onMouseLeave={(e) => {
            if (!joinedWaitlist) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.btnBg;
            }
          }}
        >
          {ctaLabel ?? (joinedWaitlist ? "Access Request Received" : "Join Waitlist")}
        </button>
        )}

        {/* Already Registered? */}
        {joinedWaitlist && <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            letterSpacing: "0.08em",
            color: C.italicText,
            textAlign: "center",
            textTransform: "uppercase",
            margin: "0 0 24px",
          }}
        >
          You’ll be notified as soon as your access is approved
        </p>}

        {/* Footer meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `1px solid ${C.border}`,
            paddingTop: "10px",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "9px",
              letterSpacing: "0.1em",
              color: C.metaText,
              textTransform: "uppercase",
            }}
          >
            REF_ID: ONE_LMT_V1.04
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "9px",
              letterSpacing: "0.1em",
              color: C.metaText,
              textTransform: "uppercase",
            }}
          >
            SEC_LVL: ALPHA
          </span>
        </div>
      </div>
    </div>
  );
}
