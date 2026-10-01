import { useEffect, useState } from "react";
import { MoveIcon } from "../components/MoveIcon";
import { useRemainingMs } from "../lib/clock";
import { MOVES, moveLabels } from "../lib/format";
import { MatchRound, Move, PhaseBracketSnapshot, RoomSettings, SafeMatch, Tournament } from "../types";

const KEYS: Record<string, Move> = { "1": "rock", "2": "paper", "3": "scissors", t: "rock", k: "paper", m: "scissors" };

interface MatchPageProps {
  match: SafeMatch;
  playerId: string;
  settings: RoomSettings;
  onMove: (matchId: string, move: Move) => void;
}

export function MatchPage({ match, playerId, settings, onMove }: MatchPageProps) {
  const [picked, setPicked] = useState<Move | null>(null);
  const countdownMs = useRemainingMs(match.countdownEndsAt, 100);
  const isP1 = match.player1.id === playerId;
  const me = isP1 ? match.player1 : match.player2;
  const opponent = isP1 ? match.player2 : match.player1;
  const counting = countdownMs > 0;
  const revealing = counting && match.rounds.length > 0;
  const locked = Boolean(picked) || match.lockedPlayerIds.includes(playerId);
  const opponentLocked = match.lockedPlayerIds.includes(opponent.id);
  const canMove = match.status === "playing" && !counting && !locked;

  // A new round (or a new match) clears the local pick.
  useEffect(() => setPicked(null), [match.id, match.rounds.length]);

  function choose(move: Move) {
    if (!canMove) return;
    setPicked(move);
    onMove(match.id, move);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
      const move = KEYS[event.key.toLocaleLowerCase("tr-TR")];
      if (move) choose(move);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="match">
      <p className="match__context">
        <strong>{match.phaseName}</strong> · ilk {settings.winningScore} puanı alan tur atlar
      </p>

      <section className="score" aria-label="Skor">
        <div className="score__side">
          <span className="score__who">Sen</span>
          <span className="score__name">{me.name}</span>
        </div>
        <p className="score__nums" aria-live="polite">
          <span>{me.score}</span>
          <span className="score__dash">–</span>
          <span>{opponent.score}</span>
        </p>
        <div className="score__side score__side--right">
          <span className="score__who">Rakip</span>
          <span className="score__name">{opponent.name}</span>
        </div>
      </section>

      {counting && !revealing ? (
        <section className="countin" aria-live="assertive">
          <span>Maç başlıyor</span>
          <strong key={Math.ceil(countdownMs / 1000)}>{Math.ceil(countdownMs / 1000)}</strong>
        </section>
      ) : revealing ? (
        <Reveal round={match.rounds[match.rounds.length - 1]} isP1={isP1} myId={playerId} nextInMs={countdownMs} />
      ) : (
        <>
          <MoveClock endsAt={match.roundEndsAt} totalSeconds={settings.moveSeconds} running={match.status === "playing"} />
          <p className="match__cue" aria-live="polite">
            {match.status === "paused"
              ? "Yönetici turnuvayı duraklattı. Süre durdu."
              : locked
                ? opponentLocked
                  ? "İkiniz de seçtiniz, sonuç geliyor…"
                  : `${picked ? moveLabels[picked] : "Hamlen"} kilitlendi. ${opponent.name} bekleniyor.`
                : `Seç: taş, kağıt ya da makas.${opponentLocked ? ` ${opponent.name} seçti bile.` : ""} Süre dolarsa hamle sistemce atanır.`}
          </p>
          <div className="moves" role="group" aria-label="Hamleni seç">
            {MOVES.map((move, index) => (
              <button
                aria-keyshortcuts={`${index + 1} ${moveLabels[move][0]}`}
                aria-pressed={picked === move}
                className="move"
                disabled={!canMove}
                key={move}
                onClick={() => choose(move)}
                type="button"
              >
                <span className="move__key" aria-hidden="true">
                  {index + 1}
                </span>
                <MoveIcon move={move} size={72} />
                <span className="move__label">{moveLabels[move]}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <RoundLog rounds={match.rounds} isP1={isP1} myId={playerId} />
    </div>
  );
}

function MoveClock({ endsAt, totalSeconds, running }: { endsAt: string | null; totalSeconds: number; running: boolean }) {
  const remaining = useRemainingMs(running ? endsAt : null, 100);
  const seconds = Math.ceil(remaining / 1000);
  const ratio = endsAt && running ? Math.min(1, remaining / (totalSeconds * 1000)) : 1;
  return (
    <div className={`clock${seconds <= 3 && running && endsAt ? " is-hot" : ""}`}>
      <div className="clock__track" aria-hidden="true">
        <div className="clock__fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <span className="clock__num" aria-label={`${seconds} saniye kaldı`}>
        {running && endsAt ? String(seconds).padStart(2, "0") : "––"}
      </span>
    </div>
  );
}

function Reveal({ round, isP1, myId, nextInMs }: { round: MatchRound; isP1: boolean; myId: string; nextInMs: number }) {
  const mine = isP1 ? round.p1Move : round.p2Move;
  const theirs = isP1 ? round.p2Move : round.p1Move;
  const outcome = roundOutcome(round, myId);
  return (
    <section className={`reveal is-${outcome}`} aria-live="assertive">
      <div className="reveal__hand">
        <MoveIcon move={mine} size={88} />
        <span>{moveLabels[mine]}</span>
      </div>
      <div className="reveal__verdict">
        <strong>{outcome === "win" ? "Round senin" : outcome === "loss" ? "Round rakibin" : "Berabere"}</strong>
        <span>Sıradaki round {Math.ceil(nextInMs / 1000)} sn</span>
      </div>
      <div className="reveal__hand">
        <MoveIcon move={theirs} size={88} />
        <span>{moveLabels[theirs]}</span>
      </div>
    </section>
  );
}

function RoundLog({ rounds, isP1, myId }: { rounds: MatchRound[]; isP1: boolean; myId: string }) {
  if (rounds.length === 0) return null;
  return (
    <section className="round-log">
      <header className="sheet-head sheet-head--small">
        <h2>Roundlar</h2>
        <span>{rounds.length}</span>
      </header>
      <ol>
        {[...rounds].reverse().map((round) => {
          const outcome = roundOutcome(round, myId);
          return (
            <li className={`round-log__row is-${outcome}`} key={round.roundNumber}>
              <span className="round-log__no">R{round.roundNumber}</span>
              <span>
                {moveLabels[isP1 ? round.p1Move : round.p2Move]} × {moveLabels[isP1 ? round.p2Move : round.p1Move]}
              </span>
              <strong>{outcome === "win" ? "Sen +1" : outcome === "loss" ? "Rakip +1" : "Berabere"}</strong>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function roundOutcome(round: MatchRound, myId: string): "win" | "loss" | "draw" {
  if (!round.winner) return "draw";
  return round.winner === myId ? "win" : "loss";
}

interface PlayerStatusProps {
  bracket: PhaseBracketSnapshot[];
  tournament: Tournament;
  playerId: string;
  autoAdvance: boolean;
  onOpenBracket: () => void;
}

/** What a player sees between their matches. */
export function PlayerStatus({ bracket, tournament, playerId, autoAdvance, onOpenBracket }: PlayerStatusProps) {
  const mine = bracket
    .flatMap((phase) => phase.matches)
    .filter((match) => match.player1.id === playerId || match.player2.id === playerId);
  const latest = mine[mine.length - 1];
  const nextPhase = tournament.phases[tournament.currentPhaseIndex + 1];

  let title = "İzleyicisin";
  let body = "Bu turnuvanın tablosunda yoksun; maçları buradan ve tablodan takip edebilirsin.";
  let tone: "neutral" | "good" | "out" = "neutral";

  if (latest) {
    const opponent = latest.player1.id === playerId ? latest.player2 : latest.player1;
    const myScore = latest.player1.id === playerId ? latest.player1.score : latest.player2.score;
    const won = latest.winner?.id === playerId;

    if (latest.status === "waiting") {
      title = `İlk rakibin: ${opponent.name}`;
      body = `${latest.phaseName} · maçın, yönetici turnuvayı başlatınca açılır.`;
    } else if (latest.isBye) {
      tone = "good";
      title = "Bu turu BYE ile geçtin";
      body = `${latest.phaseName} turunda rakibin yok. Diğer maçlar bitince sıradaki tur başlar.`;
    } else if (won) {
      tone = "good";
      title = `${latest.phaseName} geçildi`;
      body =
        latest.status === "walkover"
          ? `${opponent.name} hükmen elendi.`
          : `${opponent.name} karşısında ${myScore}–${opponent.score}.`;
      body +=
        tournament.status === "paused"
          ? " Turnuva şu an duraklatılmış."
          : nextPhase
            ? autoAdvance
              ? ` Diğer maçlar bitince ${nextPhase.name} kendiliğinden başlar.`
              : ` Diğer maçlar bitince yönetici ${nextPhase.name} turunu başlatır.`
            : "";
    } else {
      tone = "out";
      title = "Elendin";
      body =
        latest.status === "walkover"
          ? `${latest.phaseName} · maç ${opponent.name} oyuncusuna hükmen verildi.`
          : `${latest.phaseName} · ${opponent.name} ${opponent.score}–${myScore} kazandı.`;
      body += " Turnuvanın kalanını izleyebilirsin.";
    }
  }

  const lastRound = latest?.rounds[latest.rounds.length - 1];
  const isP1 = latest?.player1.id === playerId;
  return (
    <section className={`status-sheet is-${tone}`}>
      <h1>{title}</h1>
      <p>{body}</p>
      {lastRound && latest && latest.status !== "waiting" && (
        <p className="status-sheet__last">
          Son round: {moveLabels[isP1 ? lastRound.p1Move : lastRound.p2Move]} ×{" "}
          {moveLabels[isP1 ? lastRound.p2Move : lastRound.p1Move]}
        </p>
      )}
      <button className="btn" onClick={onOpenBracket} type="button">
        Tabloyu aç
      </button>
    </section>
  );
}
