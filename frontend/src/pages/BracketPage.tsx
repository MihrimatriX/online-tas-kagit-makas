import { LiveBracket } from "../components/bracket/LiveBracket";
import { PhaseBracketSnapshot, Tournament } from "../types";

interface BracketPageProps {
  bracket: PhaseBracketSnapshot[];
  tournament: Tournament | null;
  playerId: string | null;
}

export function BracketPage({ bracket, tournament, playerId }: BracketPageProps) {
  return (
    <main className="page-stack">
      <LiveBracket bracket={bracket} playerId={playerId} tournament={tournament} />
    </main>
  );
}
