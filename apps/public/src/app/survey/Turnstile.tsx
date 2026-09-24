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
  // Which render attempt failed and how ("load" or Turnstile's error code); a new resetKey starts
  // clean without resetting state here.
  const [failure, setFailure] = useState<{ attempt: number; code: string } | null>(null);
  const failed = failure?.attempt === resetKey ? failure.code : null;

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
          callback: (token: string) => {
            onToken(token);
            // Turnstile retries some errors itself; a later success clears the message.
            if (!cancelled) setFailure(null);
          },
          "expired-callback": () => onToken(null),
          // Without this the invisible widget fails silently and the button waits forever.
          "error-callback": (code?: string) => {
            onToken(null);
            if (!cancelled) setFailure({ attempt: resetKey, code: String(code ?? "unknown") });
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailure({ attempt: resetKey, code: "load" });
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
          The security check could not {failed === "load" ? "load" : "finish"}. Please check your connection and reload
          the page, or ask the desk for a paper form.
          {failed !== "load" && <span className="mt-1 block text-xs font-normal text-slate-600">Error code: {failed}</span>}
        </p>
      )}
    </div>
  );
}
