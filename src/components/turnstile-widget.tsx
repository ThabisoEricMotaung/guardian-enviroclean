"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

// Explicit-rendering Turnstile embed — no wrapper package, just
// Cloudflare's own script + JS API, per
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/.
// Renders into its own container; the parent form reads the current
// token from `onToken` state rather than relying on Turnstile's
// automatic `cf-turnstile-response` form-field injection, since our
// submission already builds its own FormData by hand (see
// request-quote-form.tsx).
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const rawId = useId();
  const containerId = `turnstile-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (!scriptReady || !window.turnstile || !containerRef.current) return;
    if (widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Rendering is a one-time DOM-imperative action per mount; onToken
    // is a stable setter from the parent and doesn't need to retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} id={containerId} />
    </>
  );
}
