import { TURNSTILE_ACTION } from "@feedback/shared";
import { useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile, rendered only on the last step: its tokens expire after five minutes and
 * the survey takes two or three. `onToken` must be stable (useCallback); change `resetKey` to get
 * a fresh token after a failed submission, since a token can be used only once.
 */
export function Turnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string | null) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  // Which render attempt failed to load; a new resetKey starts clean without resetting state here.
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);
  const failed = failedAttempt === resetKey;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) setFailedAttempt(resetKey);
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, onToken, resetKey]);

  return (
    <div className="mt-4">
      <div ref={container} />
      {failed && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-800">
          The security check could not load. Please check your connection and reload the page, or ask the desk for a
          paper form.
        </p>
      )}
    </div>
  );
}
