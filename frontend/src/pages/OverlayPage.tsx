import { useEffect, useState } from "react";
import { ActivityFeed } from "../components/live/ActivityFeed";
import { ActiveMatchesPanel } from "../components/live/ActiveMatchesPanel";
import { LiveBracket } from "../components/bracket/LiveBracket";
import { socket } from "../lib/socket";
import { TournamentSnapshot } from "../types";

interface OverlayPageProps {
  snapshot: TournamentSnapshot;
  chroma?: boolean;
  overlayUrl?: string;
  chromaUrl?: string;
  onCopyOverlay?: () => void;
  onOpenOverlay?: () => void;
}

export function OverlayPage({ snapshot, chroma = false, overlayUrl, chromaUrl, onCopyOverlay, onOpenOverlay }: OverlayPageProps) {
  return (
    <main className={chroma ? "overlay-page chroma" : "overlay-page"}>
      <ActiveMatchesPanel matches={snapshot.activeMatches} />
      <div className="overlay-main">
        <LiveBracket bracket={snapshot.bracket} playerId={null} tournament={snapshot.tournament} />
        {overlayUrl && (
          <div className="overlay-links">
            <button className="secondary-button" type="button" onClick={onCopyOverlay}>
              Yayın linkini kopyala
            </button>
            <button className="secondary-button" type="button" onClick={onOpenOverlay}>
              Yeni pencerede aç
            </button>
            {chromaUrl && (
              <a className="secondary-button" href={chromaUrl} target="_blank" rel="noreferrer">
                Yeşil fon (OBS)
              </a>
            )}
          </div>
        )}
      </div>
      <ActivityFeed events={snapshot.feed.slice(0, 8)} />
    </main>
  );
}

export function SpectatorOverlay({ code, chroma }: { code: string; chroma: boolean }) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onSnap = (payload: TournamentSnapshot) => {
      setSnapshot(payload);
      setError(null);
    };
    const onErr = ({ message }: { message: string }) => setError(message);
    socket.on("tournament:snapshot", onSnap);
    socket.on("app:error", onErr);

    const join = () => socket.emit("lobby:spectate", { lobbyCode: code });
    socket.on("connect", join);
    if (socket.connected) join();

    return () => {
      socket.off("tournament:snapshot", onSnap);
      socket.off("app:error", onErr);
      socket.off("connect", join);
    };
  }, [code]);

  if (error) {
    return (
      <main className={`overlay-standalone ${chroma ? "chroma" : ""}`}>
        <p>{error}</p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className={`overlay-standalone ${chroma ? "chroma" : ""}`}>
        <p>Yayın bağlanıyor…</p>
      </main>
    );
  }

  return (
    <div className={`overlay-standalone ${chroma ? "chroma" : ""}`}>
      <OverlayPage snapshot={snapshot} chroma={chroma} />
    </div>
  );
}
