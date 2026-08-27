import { AdminActionLog } from "../components/admin/AdminActionLog";
import { AdminMatchControl } from "../components/admin/AdminMatchControl";
import { AdminPhaseControl } from "../components/admin/AdminPhaseControl";
import { AdminRoomSettings, RoomPatch } from "../components/admin/AdminRoomSettings";
import { AdminTestRoom } from "../components/admin/AdminTestRoom";
import { PhaseBracketSnapshot, SafeMatch, TournamentSnapshot } from "../types";

interface AdminPageProps {
  snapshot: TournamentSnapshot;
  overlayUrl: string;
  chromaUrl: string;
  onSeed: () => void;
  onStartTournament: () => void;
  onStartPhase: () => void;
  onAdvancePhase: () => void;
  onShowChampion: () => void;
  onAddTestPlayer: () => void;
  onStartTestTournament: () => void;
  onAssignWinner: (matchId: string, winnerId: string) => void;
  onRestartMatch: (matchId: string) => void;
  onPausePhase: () => void;
  onResumePhase: () => void;
  onClearFeed: () => void;
  onUpdateRoom: (patch: RoomPatch) => void;
  onCopyOverlay: () => void;
}

export function AdminPage({
  snapshot,
  overlayUrl,
  chromaUrl,
  onSeed,
  onStartTournament,
  onStartPhase,
  onAdvancePhase,
  onShowChampion,
  onAddTestPlayer,
  onStartTestTournament,
  onAssignWinner,
  onRestartMatch,
  onPausePhase,
  onResumePhase,
  onClearFeed,
  onUpdateRoom,
  onCopyOverlay
}: AdminPageProps) {
  const matches = flattenMatches(snapshot.bracket);

  return (
    <main className="page-grid admin-grid">
      <AdminPhaseControl
        bracket={snapshot.bracket}
        tournament={snapshot.tournament}
        overlayUrl={overlayUrl}
        chromaUrl={chromaUrl}
        onAdvancePhase={onAdvancePhase}
        onSeed={onSeed}
        onShowChampion={onShowChampion}
        onStartPhase={onStartPhase}
        onStartTournament={onStartTournament}
        onPausePhase={onPausePhase}
        onResumePhase={onResumePhase}
        onClearFeed={onClearFeed}
        onCopyOverlay={onCopyOverlay}
      />
      <AdminRoomSettings
        lobby={snapshot.lobby}
        tournament={snapshot.tournament}
        onUpdate={onUpdateRoom}
      />
      <AdminTestRoom
        lobby={snapshot.lobby}
        tournament={snapshot.tournament}
        onAddTestPlayer={onAddTestPlayer}
        onStartTestTournament={onStartTestTournament}
      />
      <AdminMatchControl matches={matches} onAssignWinner={onAssignWinner} onRestartMatch={onRestartMatch} />
      <AdminActionLog actions={snapshot.adminActions} />
    </main>
  );
}

function flattenMatches(bracket: PhaseBracketSnapshot[]): SafeMatch[] {
  return bracket.flatMap((phase) => phase.matches);
}
