import { Timer, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { SafeMatch } from "../../types";
import { statusLabel } from "../../lib/format";

interface ActiveMatchesPanelProps {
  matches: SafeMatch[];
}

export function ActiveMatchesPanel({ matches }: ActiveMatchesPanelProps) {
  return (
    <section className="panel active-panel" aria-label="Aktif maclar">
      <div className="panel-head">
        <span>Şu an oynanan maçlar</span>
        <span>{matches.length}</span>
      </div>
      <div className="active-match-list">
        {matches.length === 0 ? (
          <div className="empty-state compact">Şu an kimse oynamıyor.</div>
        ) : (
          matches.map((match) => (
            <article className="active-match-card" key={match.id}>
              <div className="active-match-names">
                <span>{match.player1.name}</span>
                <span>{match.player2.name}</span>
              </div>
              <div className="active-match-score">
                <strong>{match.player1.score}</strong>
                <span>-</span>
                <strong>{match.player2.score}</strong>
              </div>
              <div className="active-match-meta">
                {match.status === "playing" ? <Timer size={14} /> : <Trophy size={14} />}
                <span>{statusLabel(match.status)}</span>
                {match.roundEndsAt && match.status === "playing" && (
                  <MatchMiniTimer endsAt={match.roundEndsAt} />
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function MatchMiniTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(10);

  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return <span className="mini-timer">{remaining}s</span>;
}
