import type { CSSProperties } from "react";
import { Trophy } from "lucide-react";
import { PhaseBracketSnapshot, SafeMatch, Tournament } from "../../types";
import { statusLabel } from "../../lib/format";
import { MatchSlot } from "./MatchSlot";

interface LiveBracketProps {
  bracket: PhaseBracketSnapshot[];
  tournament: Tournament | null;
  playerId: string | null;
}

type TreeNode =
  | {
      id: string;
      kind: "match";
      match: SafeMatch;
      label: string;
    }
  | {
      id: string;
      kind: "placeholder";
      label: string;
    }
  | {
      id: string;
      kind: "champion";
      label: string;
    };

export function LiveBracket({ bracket, tournament, playerId }: LiveBracketProps) {
  const treeRounds = buildTreeRounds(bracket, tournament);

  return (
    <section className="bracket-board" aria-label="Canlı bracket">
      {bracket.length === 0 ? (
        <div className="empty-state">Tablo henüz yok. Admin eşleşmeleri oluşturunca burada açılır.</div>
      ) : (
        <div className="bracket-tree-scroll">
          <div className="bracket-tree">
            {treeRounds.map(({ phase, nodes }, phaseIndex) => (
              <section
                className={`tree-round ${phase.phaseKey === tournament?.currentPhaseKey ? "current" : ""} status-${phase.status}`}
                key={phase.phaseKey}
                style={{ "--tree-gap": `${Math.max(12, phaseIndex * 34 + 12)}px` } as CSSProperties}
              >
                <div className="phase-column-head">
                  <span>{phase.name}</span>
                  <small>{statusLabel(phase.status)}</small>
                </div>
                <div className="tree-node-list">
                  {nodes.map((node, nodeIndex) => (
                    <TreeNodeCard
                      key={node.id}
                      node={node}
                      playerId={playerId}
                      hasNextRound={phaseIndex < treeRounds.length - 1}
                      hasPairConnector={nodeIndex % 2 === 0 ? nodeIndex + 1 < nodes.length : true}
                      pairPosition={nodeIndex % 2 === 0 ? "top" : "bottom"}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TreeNodeCard({
  node,
  playerId,
  hasNextRound,
  hasPairConnector,
  pairPosition
}: {
  node: TreeNode;
  playerId: string | null;
  hasNextRound: boolean;
  hasPairConnector: boolean;
  pairPosition: "top" | "bottom";
}) {
  return (
    <div
      className={`tree-node-wrap ${hasNextRound ? "has-next" : ""} ${hasPairConnector ? "has-pair" : ""} pair-${pairPosition}`}
    >
      {node.kind === "match" ? (
        <MatchSlot match={node.match} playerId={playerId} />
      ) : node.kind === "champion" ? (
        <article className="champion-tree-node">
          <Trophy size={20} />
          <span>Şampiyon</span>
          <strong>{node.label}</strong>
        </article>
      ) : (
        <article className="tree-placeholder-node">
          <span>{node.label}</span>
          <strong>Bekleniyor</strong>
        </article>
      )}
    </div>
  );
}

function buildTreeRounds(bracket: PhaseBracketSnapshot[], tournament: Tournament | null) {
  let previousPlayableCount = 0;

  return bracket.map((phase) => {
    const nodes: TreeNode[] =
      phase.phaseKey === "champion"
        ? [
            {
              id: `${phase.phaseKey}_champion`,
              kind: "champion",
              label: tournament?.champion?.name ?? "Bekleniyor"
            }
          ]
        : phase.matches.length > 0
          ? phase.matches.map((match) => ({
              id: match.id,
              kind: "match" as const,
              match,
              label: `${phase.name} #${match.matchNumber}`
            }))
          : Array.from({ length: Math.max(1, Math.ceil(previousPlayableCount / 2)) }, (_, index) => ({
              id: `${phase.phaseKey}_placeholder_${index + 1}`,
              kind: "placeholder" as const,
              label: `${phase.name} #${index + 1}`
            }));

    if (phase.phaseKey !== "champion") {
      previousPlayableCount = nodes.length;
    }

    return {
      phase,
      nodes
    };
  });
}
