import { Play, UserPlus } from "lucide-react";
import { Lobby, Tournament } from "../../types";

interface AdminTestRoomProps {
  lobby: Lobby;
  tournament: Tournament | null;
  onAddTestPlayer: () => void;
  onStartTestTournament: () => void;
}

const MAX_TEST_PLAYERS = 64;

export function AdminTestRoom({
  lobby,
  tournament,
  onAddTestPlayer,
  onStartTestTournament
}: AdminTestRoomProps) {
  const playerCount = lobby.players.length;
  const testCount = lobby.players.filter((player) => player.isTest).length;
  const canEditTestRoom = lobby.status === "waiting" && !tournament;
  const canAddPlayer = canEditTestRoom && playerCount < MAX_TEST_PLAYERS;
  const canStart = canEditTestRoom && playerCount >= 2;
  const fillPercent = Math.min((playerCount / MAX_TEST_PLAYERS) * 100, 100);

  return (
    <section className="panel test-room-panel">
      <div className="panel-head">
        <span>Deneme botları</span>
        <span>
          {playerCount}/{MAX_TEST_PLAYERS}
        </span>
      </div>
      <p className="entry-hint">Tek başına denemek için bot ekle, sonra yeşil butona bas.</p>
      <div className="test-room-stats">
        <div>
          <strong>{testCount}</strong>
          <span>Bot</span>
        </div>
        <div>
          <strong>{MAX_TEST_PLAYERS - playerCount}</strong>
          <span>Slot</span>
        </div>
      </div>
      <div className="test-room-meter" aria-hidden="true">
        <span style={{ width: `${fillPercent}%` }} />
      </div>
      <div className="admin-actions">
        <button className="secondary-button" disabled={!canAddPlayer} type="button" onClick={onAddTestPlayer}>
          <UserPlus size={16} />
          Bot ekle
        </button>
        <button className="primary-button" disabled={!canStart} type="button" onClick={onStartTestTournament}>
          <Play size={16} />
          Tek başına dene
        </button>
      </div>
    </section>
  );
}
