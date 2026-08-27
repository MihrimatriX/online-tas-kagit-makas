import { RotateCcw, UserCheck } from "lucide-react";
import { SafeMatch } from "../../types";
import { statusLabel } from "../../lib/format";

interface AdminMatchControlProps {
  matches: SafeMatch[];
  onAssignWinner: (matchId: string, winnerId: string) => void;
  onRestartMatch: (matchId: string) => void;
}

export function AdminMatchControl({ matches, onAssignWinner, onRestartMatch }: AdminMatchControlProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>Maçlar</span>
        <span>{matches.length}</span>
      </div>
      <div className="admin-match-list">
        {matches.length === 0 ? (
          <div className="empty-state compact">Henüz maç yok. Önce eşleşmeleri oluştur.</div>
        ) : (
          matches.map((match) => (
            <article className="admin-match-card" key={match.id}>
              <div>
                <strong>
                  #{match.matchNumber} {match.phaseName}
                </strong>
                <span>{statusLabel(match.status)}</span>
              </div>
              <p>
                {match.player1.name} {match.player1.score} - {match.player2.score} {match.player2.name}
              </p>
              <div className="admin-match-actions">
                {!match.isBye && !match.player1.isBye && (
                  <button type="button" onClick={() => onAssignWinner(match.id, match.player1.id)}>
                    <UserCheck size={14} />
                    {match.player1.name} kazandı
                  </button>
                )}
                {!match.isBye && !match.player2.isBye && (
                  <button type="button" onClick={() => onAssignWinner(match.id, match.player2.id)}>
                    <UserCheck size={14} />
                    {match.player2.name} kazandı
                  </button>
                )}
                {!match.isBye && (
                  <button type="button" onClick={() => onRestartMatch(match.id)} title="Maçı baştan oyna">
                    <RotateCcw size={14} />
                    Sıfırla
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
