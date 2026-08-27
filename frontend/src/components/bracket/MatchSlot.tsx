import { SafeMatch } from "../../types";

interface MatchSlotProps {
  match: SafeMatch;
  playerId: string | null;
}

export function MatchSlot({ match, playerId }: MatchSlotProps) {
  return (
    <article className={`bracket-match status-${match.status}`}>
      <PlayerLine
        name={match.player1.name}
        score={match.player1.score}
        isMe={match.player1.id === playerId}
        isWinner={match.winner?.id === match.player1.id}
        isBye={Boolean(match.player1.isBye)}
      />
      <PlayerLine
        name={match.player2.name}
        score={match.player2.score}
        isMe={match.player2.id === playerId}
        isWinner={match.winner?.id === match.player2.id}
        isBye={Boolean(match.player2.isBye)}
      />
      <div className="match-foot">#{match.matchNumber}</div>
    </article>
  );
}

function PlayerLine({
  name,
  score,
  isMe,
  isWinner,
  isBye
}: {
  name: string;
  score: number;
  isMe: boolean;
  isWinner: boolean;
  isBye: boolean;
}) {
  return (
    <div className={`player-line ${isMe ? "is-me" : ""} ${isWinner ? "is-winner" : ""} ${isBye ? "is-bye" : ""}`}>
      <span>{name}</span>
      <strong>{isBye ? "-" : score}</strong>
    </div>
  );
}
