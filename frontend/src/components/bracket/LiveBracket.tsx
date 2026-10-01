import type { CSSProperties } from "react";
import { MatchPlayer, PhaseBracketSnapshot, SafeMatch, Tournament } from "../../types";
import { statusLabel } from "../../lib/format";

interface LiveBracketProps {
  bracket: PhaseBracketSnapshot[];
  tournament: Tournament | null;
  playerId: string | null;
}

type DrawNode =
  | { id: string; kind: "match"; match: SafeMatch }
  | { id: string; kind: "placeholder" }
  | { id: string; kind: "champion"; name: string | null };

export function LiveBracket({ bracket, tournament, playerId }: LiveBracketProps) {
  if (bracket.length === 0) {
    return <p className="empty-note">Tablo, admin eşleşmeleri çekince burada belirir.</p>;
  }

  const rounds = buildRounds(bracket, tournament);
  return (
    <div className="draw-scroll" role="region" aria-label="Turnuva tablosu" tabIndex={0}>
      <div className="draw" style={{ "--draw-rounds": rounds.length } as CSSProperties}>
        {rounds.map((round, roundIndex) => {
          const hasNext = roundIndex < rounds.length - 1;
          return (
            <section className={`draw-col${round.isCurrent ? " is-current" : ""}`} key={round.key}>
              <header className="draw-col__head">
                <h3>{round.name}</h3>
                <span>{statusLabel(round.status)}</span>
              </header>
              <div className="draw-col__body">
                {pairs(round.nodes).map((pair) => (
                  <div
                    className={`draw-pair${hasNext ? (pair.length === 2 ? " join-pair" : " join-single") : ""}`}
                    key={pair[0].id}
                  >
                    {pair.map((node) => (
                      <DrawCell hasPrev={roundIndex > 0} key={node.id} node={node} playerId={playerId} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DrawCell({ node, playerId, hasPrev }: { node: DrawNode; playerId: string | null; hasPrev: boolean }) {
  const prev = hasPrev ? " has-prev" : "";
  if (node.kind === "champion") {
    return (
      <article className={`slot slot--champion${prev}`}>
        <span className="slot__caption">Şampiyon</span>
        <strong>{node.name ?? "—"}</strong>
      </article>
    );
  }
  if (node.kind === "placeholder") {
    return (
      <article className={`slot slot--empty${prev}`} aria-label="Henüz belli değil">
        <div className="slot__line">—</div>
        <div className="slot__line">—</div>
      </article>
    );
  }

  const { match } = node;
  const mine = match.player1.id === playerId || match.player2.id === playerId;
  const live = match.status === "playing" || match.status === "paused";
  return (
    <article className={`slot status-${match.status}${mine ? " is-mine" : ""}${live ? " is-live" : ""}${prev}`}>
      <SlotLine match={match} player={match.player1} playerId={playerId} />
      <SlotLine match={match} player={match.player2} playerId={playerId} />
      {match.status === "walkover" && <span className="slot__note">hükmen</span>}
    </article>
  );
}

function SlotLine({ match, player, playerId }: { match: SafeMatch; player: MatchPlayer; playerId: string | null }) {
  const decided = Boolean(match.winner);
  const isWinner = match.winner?.id === player.id;
  const classes = [
    "slot__line",
    player.isBye ? "is-bye" : "",
    player.id === playerId ? "is-me" : "",
    decided && isWinner ? "is-winner" : "",
    decided && !isWinner ? "is-loser" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <span className="slot__name">{player.name}</span>
      <span className="slot__score">{player.isBye || match.isBye ? "" : player.score}</span>
    </div>
  );
}

function buildRounds(bracket: PhaseBracketSnapshot[], tournament: Tournament | null) {
  let previousCount = 0;
  return bracket.map((phase) => {
    let nodes: DrawNode[];
    if (phase.phaseKey === "champion") {
      nodes = [{ id: "champion", kind: "champion", name: tournament?.champion?.name ?? null }];
    } else if (phase.matches.length > 0) {
      nodes = phase.matches.map((match) => ({ id: match.id, kind: "match", match }));
    } else {
      nodes = Array.from({ length: Math.max(1, previousCount / 2) }, (_, index) => ({
        id: `${phase.phaseKey}-${index}`,
        kind: "placeholder"
      }));
    }
    if (phase.phaseKey !== "champion") previousCount = nodes.length;
    return {
      key: phase.phaseKey,
      name: phase.name,
      status: phase.status,
      isCurrent: phase.phaseKey === tournament?.currentPhaseKey && tournament.status !== "finished",
      nodes
    };
  });
}

function pairs<T>(items: T[]) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 2) result.push(items.slice(i, i + 2));
  return result;
}
