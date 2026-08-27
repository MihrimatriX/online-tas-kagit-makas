import { useEffect, useState } from "react";
import { MoveSelector } from "../components/match/MoveSelector";
import { MatchTimer } from "../components/match/MatchTimer";
import { ScoreBoard } from "../components/match/ScoreBoard";
import { MatchRound, Move, RoomSettings, SafeMatch } from "../types";
import { moveLabels, moveShortLabels, statusLabel } from "../lib/format";

interface MatchPageProps {
  match: SafeMatch | null;
  playerId: string | null;
  selectedMove: Move | null;
  moveLocked: boolean;
  reveal: MatchRound | null;
  settings: RoomSettings;
  onMove: (matchId: string, move: Move) => void;
}

export function MatchPage({ match, playerId, selectedMove, moveLocked, reveal, settings, onMove }: MatchPageProps) {
  if (!match) {
    return (
      <main className="page-stack">
        <section className="panel empty-match">
          <h1>Şu an maçın yok</h1>
          <p>Sıra sende olunca hamle butonları burada açılır. Tablodan turnuvayı izleyebilirsin.</p>
        </section>
      </main>
    );
  }

  const countingDown = Boolean(match.countdownEndsAt && new Date(match.countdownEndsAt).getTime() > Date.now());
  const waitingOpponent = match.status === "playing" && !countingDown && moveLocked;

  return (
    <main className="page-stack match-page">
      {countingDown && match.countdownEndsAt && <CountdownOverlay endsAt={match.countdownEndsAt} />}
      {reveal && (
        <RoundReveal round={reveal} p1Name={match.player1.name} p2Name={match.player2.name} playerId={playerId} p1Id={match.player1.id} />
      )}
      <section className="match-topline">
        <span>{match.phaseName} · ilk {settings.winningScore} puanı alan geçer</span>
        <strong>{statusLabel(match.status)}</strong>
      </section>
      <ScoreBoard match={match} playerId={playerId} winningScore={settings.winningScore} />
      <MatchTimer
        endsAt={match.roundEndsAt}
        fallbackSeconds={settings.moveSeconds}
        isRunning={match.status === "playing" && !countingDown}
      />
      <p className="match-cue">
        {match.status === "paused"
          ? "Admin maçı duraklattı."
          : countingDown
            ? "Az sonra hamle seçeceksin."
            : waitingOpponent
              ? "Hamlen kilitlendi. Rakip bekleniyor."
              : "Taş, kağıt veya makas seç. Süre dolarsa rastgele hamle yapılır."}
      </p>
      <MoveSelector
        disabled={match.status !== "playing" || countingDown || moveLocked}
        selectedMove={selectedMove}
        onMove={(move) => onMove(match.id, move)}
      />
      <section className="panel round-list">
        <div className="panel-head">
          <span>Önceki hamleler</span>
          <span>{match.rounds.length}</span>
        </div>
        {match.rounds.length === 0 ? (
          <div className="empty-state compact">İlk round bitince burada görünür.</div>
        ) : (
          match.rounds.map((round) => {
            const winnerName =
              round.winner === match.player1.id
                ? match.player1.name
                : round.winner === match.player2.id
                  ? match.player2.name
                  : null;
            return (
              <div className="round-row" key={round.roundNumber}>
                <span>
                  {round.roundNumber}. {moveShortLabels[round.p1Move]} {moveLabels[round.p1Move]} — {moveShortLabels[round.p2Move]}{" "}
                  {moveLabels[round.p2Move]}
                </span>
                <strong>{winnerName ? `${winnerName} +1` : "Berabere"}</strong>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}

function CountdownOverlay({ endsAt }: { endsAt: string }) {
  const [value, setValue] = useState(3);

  useEffect(() => {
    const tick = () => {
      setValue(Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  if (value <= 0) return null;
  return (
    <div className="countdown-overlay" aria-live="assertive">
      <span>Hazır ol</span>
      <strong>{value}</strong>
    </div>
  );
}

function RoundReveal({
  round,
  p1Name,
  p2Name,
  playerId,
  p1Id
}: {
  round: MatchRound;
  p1Name: string;
  p2Name: string;
  playerId: string | null;
  p1Id: string;
}) {
  const winnerName = round.winner ? (round.winner === p1Id ? p1Name : p2Name) : null;
  return (
    <div className="round-reveal" aria-live="polite">
      <div>
        <span className={playerId === p1Id ? "is-me" : ""}>{p1Name}</span>
        <strong>
          {moveShortLabels[round.p1Move]} {moveLabels[round.p1Move]}
        </strong>
      </div>
      <em>VS</em>
      <div>
        <span>{p2Name}</span>
        <strong>
          {moveShortLabels[round.p2Move]} {moveLabels[round.p2Move]}
        </strong>
      </div>
      <p>{winnerName ? `${winnerName} kazandı` : "Berabere"}</p>
    </div>
  );
}
