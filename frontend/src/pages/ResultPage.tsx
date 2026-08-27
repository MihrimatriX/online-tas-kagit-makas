import { Trophy } from "lucide-react";
import { TournamentSnapshot } from "../types";

interface ResultPageProps {
  snapshot: TournamentSnapshot;
}

export function ResultPage({ snapshot }: ResultPageProps) {
  const matches = snapshot.bracket.flatMap((phase) => phase.matches);
  const played = matches.filter((match) => !match.isBye && match.status !== "waiting");
  const walkovers = matches.filter((match) => match.status === "walkover").length;
  const rounds = matches.reduce((sum, match) => sum + match.rounds.length, 0);

  return (
    <main className="result-page">
      <Trophy size={58} />
      <span>Turnuva şampiyonu</span>
      <h1>{snapshot.tournament?.champion?.name ?? "Henüz belli değil"}</h1>
      <dl className="result-stats">
        <div>
          <dt>Maç</dt>
          <dd>{played.length}</dd>
        </div>
        <div>
          <dt>Round</dt>
          <dd>{rounds}</dd>
        </div>
        <div>
          <dt>Walkover</dt>
          <dd>{walkovers}</dd>
        </div>
      </dl>
    </main>
  );
}
