import { useEffect, useState } from "react";

// Deadlines come from the server; a phone whose clock is a few seconds off would otherwise
// show a wrong countdown. Every snapshot carries the server time, so we track the offset.
let offsetMs = 0;

export function syncServerClock(serverTime: string) {
  const parsed = Date.parse(serverTime);
  if (Number.isFinite(parsed)) offsetMs = parsed - Date.now();
}

function msUntil(iso: string | null | undefined) {
  return iso ? Math.max(0, Date.parse(iso) - (Date.now() + offsetMs)) : 0;
}

/** Milliseconds left until `iso`, re-rendering while it counts down. */
export function useRemainingMs(iso: string | null | undefined, stepMs = 200) {
  const [remaining, setRemaining] = useState(() => msUntil(iso));

  useEffect(() => {
    setRemaining(msUntil(iso));
    if (!iso) return;
    const timer = window.setInterval(() => {
      const next = msUntil(iso);
      setRemaining(next);
      if (next <= 0) window.clearInterval(timer);
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [iso, stepMs]);

  return remaining;
}
