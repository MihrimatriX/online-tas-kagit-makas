import { useEffect, useState } from "react";
import { LiveBracket } from "../components/bracket/LiveBracket";
import { ActiveMatchesPanel } from "../components/live/ActiveMatchesPanel";
import { ActivityFeed } from "../components/live/ActivityFeed";
import { syncServerClock } from "../lib/clock";
import { socket } from "../lib/socket";
import { TournamentSnapshot } from "../types";
import { Wordmark } from "./LandingPage";

/** Session-less broadcast view for OBS: /overlay/CODE (add ?chroma=1 for a green key background). */
export function SpectatorOverlay({ code, chroma }: { code: string; chroma: boolean }) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onSnapshot = (payload: TournamentSnapshot) => {
      syncServerClock(payload.serverTime);
      setSnapshot(payload);
      setError(null);
    };
    const onError = ({ message }: { message: string }) => setError(message);
    const join = () => socket.emit("lobby:spectate", { lobbyCode: code });

    socket.on("tournament:snapshot", onSnapshot);
    socket.on("app:error", onError);
    socket.on("connect", join);
    if (socket.connected) join();
    return () => {
      socket.off("tournament:snapshot", onSnapshot);
      socket.off("app:error", onError);
      socket.off("connect", join);
    };
  }, [code]);

  if (!snapshot || error) {
    return (
      <div className={`overlay${chroma ? " is-chroma" : ""}`}>
        <p className="overlay__panel overlay__message">{error ?? "Yayın bağlanıyor…"}</p>
      </div>
    );
  }

  const { lobby, tournament } = snapshot;
  const phase = tournament?.phases[tournament.currentPhaseIndex];
  return (
    <div className={`overlay${chroma ? " is-chroma" : ""}`}>
      <header className="overlay__panel overlay__bar">
        <Wordmark />
        <strong className="overlay__title">{lobby.name}</strong>
        <span className="overlay__phase">
          {tournament?.status === "finished" ? "Turnuva bitti" : phase ? phase.name : "Lobi açık"}
          {tournament?.status === "paused" && " · duraklatıldı"}
        </span>
        <span className="overlay__code">{lobby.code}</span>
      </header>

      {tournament?.champion && (
        <section className="overlay__panel overlay__champion">
          <span>Şampiyon</span>
          <strong>{tournament.champion.name}</strong>
        </section>
      )}

      <div className="overlay__body">
        <div className="overlay__panel overlay__bracket">
          {tournament ? (
            <LiveBracket bracket={snapshot.bracket} playerId={null} tournament={tournament} />
          ) : (
            <div className="overlay__waiting">
              <span className="field__label">Katılmak için kod</span>
              <p className="code-mega">{lobby.code}</p>
              <p>
                {lobby.players.length} oyuncu lobide · {lobby.players.filter((player) => player.isReady || player.isTest).length} hazır
              </p>
            </div>
          )}
        </div>
        <aside className="overlay__side">
          <div className="overlay__panel">
            <ActiveMatchesPanel limit={6} matches={snapshot.activeMatches} />
          </div>
          <div className="overlay__panel">
            <ActivityFeed events={snapshot.feed} limit={6} />
          </div>
        </aside>
      </div>
    </div>
  );
}
