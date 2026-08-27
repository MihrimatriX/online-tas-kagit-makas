import { Pause, Play, SkipForward, Trophy } from "lucide-react";
import { PhaseBracketSnapshot, Tournament, TournamentPhase } from "../../types";
import { statusLabel } from "../../lib/format";

interface AdminPhaseControlProps {
  tournament: Tournament | null;
  bracket: PhaseBracketSnapshot[];
  overlayUrl: string;
  chromaUrl: string;
  onSeed: () => void;
  onStartTournament: () => void;
  onStartPhase: () => void;
  onAdvancePhase: () => void;
  onShowChampion: () => void;
  onPausePhase: () => void;
  onResumePhase: () => void;
  onClearFeed: () => void;
  onCopyOverlay: () => void;
}

export function AdminPhaseControl({
  tournament,
  bracket,
  overlayUrl,
  chromaUrl,
  onSeed,
  onStartTournament,
  onStartPhase,
  onAdvancePhase,
  onShowChampion,
  onPausePhase,
  onResumePhase,
  onClearFeed,
  onCopyOverlay
}: AdminPhaseControlProps) {
  const currentPhase = tournament?.phases[tournament.currentPhaseIndex] ?? null;
  const currentColumn = bracket.find((phase) => phase.phaseKey === currentPhase?.phaseKey);
  const allCurrentMatchesDone =
    currentColumn?.matches.length &&
    currentColumn.matches.every((match) => match.status === "finished" || match.status === "walkover");

  return (
    <section className="panel admin-panel">
      <div className="panel-head">
        <span>Sıradaki adım</span>
        <span>{tournament ? statusLabel(tournament.status) : "Lobi"}</span>
      </div>
      <p className="hint-banner compact">{nextAdminHint(tournament, currentPhase)}</p>
      <div className="admin-actions">
        {!tournament && (
          <button className="primary-button" type="button" onClick={onSeed}>
            Eşleşmeleri oluştur
          </button>
        )}
        {tournament?.status === "seeded" && (
          <button className="primary-button" type="button" onClick={onStartTournament}>
            <Play size={16} />
            Turnuvayı başlat
          </button>
        )}
        {tournament?.status === "active" && currentPhase?.status === "waiting" && currentPhase.phaseKey !== "champion" && (
          <button className="primary-button" type="button" onClick={onStartPhase}>
            <Play size={16} />
            Maçları başlat
          </button>
        )}
        {tournament?.status === "active" && currentPhase?.status === "active" && currentPhase.phaseKey !== "champion" && (
          <button className="secondary-button" type="button" onClick={onPausePhase}>
            <Pause size={16} />
            Duraklat
          </button>
        )}
        {tournament?.status === "paused" && currentPhase?.phaseKey !== "champion" && (
          <button className="primary-button" type="button" onClick={onResumePhase}>
            <Play size={16} />
            Devam et
          </button>
        )}
        {tournament?.status === "active" && currentPhase?.status === "completed" && currentPhase.phaseKey !== "champion" && allCurrentMatchesDone && (
          <button className="secondary-button" type="button" onClick={onAdvancePhase}>
            <SkipForward size={16} />
            Sonraki tura geç
          </button>
        )}
        {tournament?.status === "active" && currentPhase?.phaseKey === "champion" && tournament.champion && (
          <button className="primary-button amber" type="button" onClick={onShowChampion}>
            <Trophy size={16} />
            Şampiyonu herkese göster
          </button>
        )}
      </div>
      <div className="admin-actions">
        <button className="secondary-button" type="button" onClick={onClearFeed}>
          Akışı temizle
        </button>
        <button className="secondary-button" type="button" onClick={onCopyOverlay}>
          Yayın linkini kopyala
        </button>
        <a className="secondary-button" href={overlayUrl} target="_blank" rel="noreferrer">
          Yayın ekranı
        </a>
        <a className="secondary-button" href={chromaUrl} target="_blank" rel="noreferrer">
          Yeşil fon
        </a>
      </div>
      <div className="phase-mini-list">
        {tournament?.phases.map((phase) => (
          <div className={`phase-mini status-${phase.status}`} key={phase.id}>
            <strong>{phase.name}</strong>
            <span>{statusLabel(phase.status)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function nextAdminHint(tournament: Tournament | null, currentPhase: TournamentPhase | null) {
  if (!tournament) return "Herkes hazır olunca yeşil butona bas: eşleşmeler oluşur.";
  if (tournament.status === "seeded") return "Eşleşmeler hazır. Turnuvayı başlat, sonra maçları aç.";
  if (tournament.status === "paused") return "Maçlar durdu. Devam et dersen süre yeniden işler.";
  if (currentPhase?.phaseKey === "champion") return "Şampiyon belli. Herkese göstermek için altın butona bas.";
  if (currentPhase?.status === "waiting") return `${currentPhase.name} hazır. Maçları başlat.`;
  if (currentPhase?.status === "active") return "Maçlar oynanıyor. Hepsi bitince sonraki tura geçebilirsin.";
  if (currentPhase?.status === "completed") return "Tur bitti. Sonraki tura geç.";
  return statusLabel(tournament.status);
}
