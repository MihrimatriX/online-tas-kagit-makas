import { useRemainingMs } from "../../lib/clock";
import { SafeMatch } from "../../types";

export function ActiveMatchesPanel({ matches, limit }: { matches: SafeMatch[]; limit?: number }) {
  const shown = limit ? matches.slice(0, limit) : matches;
  return (
    <section className="rail-section" aria-label="Şu an oynanan maçlar">
      <header className="sheet-head sheet-head--small">
        <h2>Şimdi oynanıyor</h2>
        <span>{matches.length}</span>
      </header>
      {matches.length === 0 ? (
        <p className="empty-note">Şu an oynanan maç yok.</p>
      ) : (
        <ul className="live-list">
          {shown.map((match) => (
            <li className="live-row" key={match.id}>
              <span className="live-row__name">{match.player1.name}</span>
              <span className="live-row__score">
                {match.player1.score}–{match.player2.score}
              </span>
              <span className="live-row__name live-row__name--right">{match.player2.name}</span>
              <span className="live-row__meta">
                {match.phaseName}
                {match.status === "paused" ? " · durdu" : <MiniClock endsAt={match.roundEndsAt} />}
              </span>
            </li>
          ))}
          {shown.length < matches.length && <li className="live-more">+{matches.length - shown.length} maç daha</li>}
        </ul>
      )}
    </section>
  );
}

function MiniClock({ endsAt }: { endsAt: string | null }) {
  const remaining = useRemainingMs(endsAt, 500);
  return endsAt && remaining > 0 ? <> · {Math.ceil(remaining / 1000)} sn</> : null;
}
