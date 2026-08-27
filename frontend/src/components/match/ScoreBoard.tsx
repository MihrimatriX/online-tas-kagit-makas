import { SafeMatch } from "../../types";

interface ScoreBoardProps {
  match: SafeMatch;
  playerId: string | null;
  winningScore: number;
}

export function ScoreBoard({ match, playerId, winningScore }: ScoreBoardProps) {
  const isPlayerOne = match.player1.id === playerId;
  const me = isPlayerOne ? match.player1 : match.player2;
  const opponent = isPlayerOne ? match.player2 : match.player1;

  return (
    <section className="scoreboard">
      <div className="fighter-card mine">
        <span>Sen · {me.name}</span>
        <strong>
          {me.score}
          <small>/{winningScore}</small>
        </strong>
      </div>
      <div className="versus">VS</div>
      <div className="fighter-card">
        <span>Rakip · {opponent.name}</span>
        <strong>
          {opponent.score}
          <small>/{winningScore}</small>
        </strong>
      </div>
    </section>
  );
}
