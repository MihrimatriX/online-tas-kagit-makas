import { useEffect, useState } from "react";

interface MatchTimerProps {
  endsAt?: string | null;
  fallbackSeconds?: number;
  isRunning: boolean;
}

export function MatchTimer({ endsAt, fallbackSeconds = 10, isRunning }: MatchTimerProps) {
  const [remaining, setRemaining] = useState(fallbackSeconds);

  useEffect(() => {
    if (!isRunning) {
      setRemaining(fallbackSeconds);
      return;
    }

    const tick = () => {
      if (endsAt) {
        const ms = new Date(endsAt).getTime() - Date.now();
        setRemaining(Math.max(Math.ceil(ms / 1000), 0));
        return;
      }
      setRemaining(fallbackSeconds);
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, fallbackSeconds, isRunning]);

  const total = fallbackSeconds;
  const progress = Math.max(remaining / total, 0) * 100;

  return (
    <div className="match-timer">
      <div className="timer-track">
        <div className={remaining <= 3 ? "timer-fill hot" : "timer-fill"} style={{ width: `${progress}%` }} />
      </div>
      <span>{isRunning ? `Kalan ${remaining} sn` : "Süre bekleniyor"}</span>
    </div>
  );
}
