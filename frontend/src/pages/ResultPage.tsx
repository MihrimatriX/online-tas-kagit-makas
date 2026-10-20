import { Trophy } from "lucide-react";
import { TournamentSnapshot } from "../types";

interface ResultPageProps {
  snapshot: TournamentSnapshot;
  playerId: string;
  isAdmin: boolean;
  onOpenBracket: () => void;
}

export function ResultPage({ snapshot, playerId, isAdmin, onOpenBracket }: ResultPageProps) {
  const champion = snapshot.tournament?.champion;
  const matches = snapshot.bracket.flatMap((phase) => phase.matches);
  const played = matches.filter((match) => !match.isBye && match.status !== "waiting");
  const final = snapshot.bracket.find((phase) => phase.phaseKey === "final")?.matches[0];
  const semiLosers = (snapshot.bracket.find((phase) => phase.phaseKey === "semi_final")?.matches ?? [])
    .map((match) => match.loser)
    .filter((loser) => loser && !loser.isBye);
  const longest = played.reduce<(typeof played)[number] | null>(
    (best, match) => (!best || match.rounds.length > best.rounds.length ? match : best),
    null
  );
  const rounds = played.reduce((sum, match) => sum + match.rounds.length, 0);

  return (
    <div className="result card">
      <section className="result__crown">
        <Trophy className="result__trophy" size={44} aria-hidden="true" />
        <span className="field__label">Şampiyon</span>
        <h1 className="result__name">{champion?.name ?? "—"}</h1>
        {champion?.id === playerId && <p className="result__you">Bu sensin. Tebrikler.</p>}
      </section>

      <ol className="podium">
        {final?.loser && (
          <li>
            <span className="podium__place">2.</span>
            <span>{final.loser.name}</span>
          </li>
        )}
        {semiLosers.map((loser) => (
          <li key={loser!.id}>
            <span className="podium__place">3.</span>
            <span>{loser!.name}</span>
          </li>
        ))}
      </ol>

      <dl className="stats">
        <div>
          <dt>Maç</dt>
          <dd>{played.length}</dd>
        </div>
        <div>
          <dt>Round</dt>
          <dd>{rounds}</dd>
        </div>
        <div>
          <dt>Hükmen</dt>
          <dd>{matches.filter((match) => match.status === "walkover").length}</dd>
        </div>
        {longest && longest.rounds.length > 0 && (
          <div className="stats__wide">
            <dt>En uzun maç</dt>
            <dd>
              {longest.player1.name} – {longest.player2.name} · {longest.rounds.length} round
            </dd>
          </div>
        )}
      </dl>

      <button className="btn" onClick={onOpenBracket} type="button">
        Tabloyu gör
      </button>
      {!isAdmin && <p className="empty-note">Yönetici yeni turnuva açarsa bu lobide kalırsın.</p>}
    </div>
  );
}
