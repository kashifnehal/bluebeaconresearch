// Rendered consent banner (react-dom/client via the linkedom harness).
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

const document = setupDom();

const BANNER_TEXT =
  "We use a privacy-focused analytics tool to count visits and see which pages help. It is off until you accept.";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function reactProps(el: Element): { onClick?: () => void } | null {
  const propsKey = Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactProps$"));
  return propsKey ? (el as unknown as Record<string, { onClick?: () => void }>)[propsKey] : null;
}

function visible(): boolean {
  return (document.body.textContent ?? "").includes(BANNER_TEXT);
}

async function click(testId: string) {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  assert.ok(el, `missing ${testId}`);
  const props = reactProps(el);
  assert.ok(props?.onClick, `${testId} has no onClick`);
  await act(async () => {
    props.onClick?.();
  });
}

function storedChoice(): { v: number; analytics: boolean; at: string } | null {
  const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as { v: number; analytics: boolean; at: string };
}

async function main() {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  window.localStorage.removeItem(CONSENT_STORAGE_KEY);

  const { ConsentBanner } = await import("./ConsentBanner");
  const { CookieSettingsButton } = await import("./CookieSettingsButton");

  await runTest("banner is shown when no choice is stored", async () => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    const { root } = await renderElement(document, createElement(ConsentBanner));
    try {
      assert.equal(visible(), true);
      assert.ok(document.querySelector('[data-testid="consent-accept"]'));
      assert.ok(document.querySelector('[data-testid="consent-decline"]'));
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("Accept stores analytics true and hides the banner", async () => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    const { root } = await renderElement(document, createElement(ConsentBanner));
    try {
      await click("consent-accept");
      const choice = storedChoice();
      assert.ok(choice);
      assert.equal(choice.v, 1);
      assert.equal(choice.analytics, true);
      assert.match(choice.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(visible(), false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("Decline stores analytics false and hides the banner", async () => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    const { root } = await renderElement(document, createElement(ConsentBanner));
    try {
      await click("consent-decline");
      const choice = storedChoice();
      assert.ok(choice);
      assert.equal(choice.v, 1);
      assert.equal(choice.analytics, false);
      assert.match(choice.at, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(visible(), false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("Cookie settings reopens the banner", async () => {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    const { root } = await renderElement(
      document,
      createElement("div", null, createElement(ConsentBanner), createElement(CookieSettingsButton)),
    );
    try {
      await click("consent-decline");
      assert.equal(visible(), false);
      await click("cookie-settings");
      assert.equal(visible(), true);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("banner still renders when storage throws", async () => {
    const original = window.localStorage;
    const throwing = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: throwing });
    try {
      const { root } = await renderElement(document, createElement(ConsentBanner));
      try {
        assert.equal(visible(), true);
      } finally {
        await act(async () => root.unmount());
      }
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: original });
    }
  });
}

void main();
