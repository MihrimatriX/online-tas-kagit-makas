import { useEffect, useMemo, useState } from "react";
import { Brackets, Gamepad2, LayoutDashboard, Monitor, Trophy, Users } from "lucide-react";
import { ActiveMatchesPanel } from "./components/live/ActiveMatchesPanel";
import { ActivityFeed } from "./components/live/ActivityFeed";
import { socket } from "./lib/socket";
import { copyText, overlayUrl, readRoute, roomSettings } from "./lib/format";
import { applyClientSeo } from "./lib/seo";
import { soundAssigned, soundReveal, soundWin } from "./lib/sound";
import { AdminPage } from "./pages/AdminPage";
import { BracketPage } from "./pages/BracketPage";
import { LandingPage } from "./pages/LandingPage";
import { LobbyPage } from "./pages/LobbyPage";
import { MatchPage } from "./pages/MatchPage";
import { OverlayPage, SpectatorOverlay } from "./pages/OverlayPage";
import { ResultPage } from "./pages/ResultPage";
import { MatchRound, Move, SessionState, TournamentSnapshot } from "./types";

type ViewKey = "lobby" | "admin" | "match" | "bracket" | "result" | "overlay";
type MobilePane = "main" | "live";

const SESSION_KEY = "tmk_session";

function readSavedSession(): SessionState | null {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as SessionState;
    if (!parsed.playerId || !parsed.lobbyCode || !parsed.reconnectToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function emitReconnect() {
  const saved = readSavedSession();
  if (!saved) return;
  socket.emit("session:reconnect", {
    lobbyCode: saved.lobbyCode,
    playerId: saved.playerId,
    reconnectToken: saved.reconnectToken
  });
}

export function App() {
  const route = useMemo(() => readRoute(), []);
  const [session, setSession] = useState<SessionState | null>(null);
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [view, setView] = useState<ViewKey>("lobby");
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [reveal, setReveal] = useState<MatchRound | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [mobilePane, setMobilePane] = useState<MobilePane>("main");

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    const origin = window.location.origin;
    if (route.overlayCode) {
      applyClientSeo({
        title: `Yayın ${route.overlayCode} — RPS Arena`,
        description: "OBS overlay — turnuva yayını",
        url: `${origin}/overlay/${route.overlayCode}`,
        robots: "noindex, nofollow"
      });
      return;
    }
    if (snapshot && session) {
      applyClientSeo({
        title: `${snapshot.lobby.name} · ${snapshot.lobby.code} — RPS Arena`,
        description: `${snapshot.lobby.players.length} oyuncu · ${snapshot.lobby.name} lobisi. Kod: ${snapshot.lobby.code}`,
        url: `${origin}/?code=${snapshot.lobby.code}`
      });
      return;
    }
    if (route.joinCode) {
      applyClientSeo({
        title: `Lobi ${route.joinCode} — RPS Arena`,
        description: `RPS Arena lobisine davetlisin. Kod: ${route.joinCode}`,
        url: `${origin}/?code=${route.joinCode}`
      });
      return;
    }
    applyClientSeo({ url: `${origin}/` });
  }, [route, session, snapshot]);

  useEffect(() => {
    const onReady = (payload: SessionState) => {
      setSession(payload);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    const onSnapshot = (payload: TournamentSnapshot) => {
      setSnapshot(payload);
    };

    const onAssigned = () => {
      setSelectedMove(null);
      setReveal(null);
      setView("match");
      setMobilePane("main");
      soundAssigned();
    };

    const onRoundResult = (payload: { round: MatchRound }) => {
      setSelectedMove(null);
      setReveal(payload.round);
      soundReveal();
      window.setTimeout(() => setReveal(null), 2200);
    };

    const onFinished = () => {
      setSelectedMove(null);
      setReveal(null);
      setView("bracket");
      soundWin();
    };

    const onWinner = () => {
      setView("result");
      soundWin();
    };

    const onMoveAccepted = ({ move }: { move: Move }) => {
      setSelectedMove(move);
    };

    const onError = ({ message }: { message: string }) => {
      showToast(message);
    };

    const onConnect = () => {
      setConnected(true);
      if (!readRoute().overlayCode) emitReconnect();
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    socket.on("session:ready", onReady);
    socket.on("tournament:snapshot", onSnapshot);
    socket.on("match:assigned", onAssigned);
    socket.on("match:roundResult", onRoundResult);
    socket.on("match:finished", onFinished);
    socket.on("tournament:winner", onWinner);
    socket.on("match:moveAccepted", onMoveAccepted);
    socket.on("app:error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (socket.connected && !route.overlayCode) {
      emitReconnect();
    }

    return () => {
      socket.off("session:ready", onReady);
      socket.off("tournament:snapshot", onSnapshot);
      socket.off("match:assigned", onAssigned);
      socket.off("match:roundResult", onRoundResult);
      socket.off("match:finished", onFinished);
      socket.off("tournament:winner", onWinner);
      socket.off("match:moveAccepted", onMoveAccepted);
      socket.off("app:error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const myMatch = useMemo(() => {
    if (!snapshot || !session) return null;
    return (
      snapshot.bracket
        .flatMap((phase) => phase.matches)
        .find(
          (match) =>
            (match.status === "playing" || match.status === "paused") &&
            (match.player1.id === session.playerId || match.player2.id === session.playerId)
        ) ?? null
    );
  }, [snapshot, session]);

  if (route.overlayCode) {
    return (
      <>
        <SpectatorOverlay code={route.overlayCode} chroma={route.chroma} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  if (!session || !snapshot) {
    return (
      <>
        <LandingPage
          initialCode={route.joinCode}
          onCreateLobby={(name) => socket.emit("lobby:create", { name })}
          onJoinLobby={(name, lobbyCode) => socket.emit("lobby:join", { name, lobbyCode })}
          onJoinRandomLobby={(name) => socket.emit("lobby:joinRandom", { name })}
        />
        {!connected && <div className="toast">Sunucuya bağlanılıyor...</div>}
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  const isAdmin = session.playerId === snapshot.lobby.adminPlayerId;
  const currentPhase = snapshot.tournament?.phases[snapshot.tournament.currentPhaseIndex] ?? null;
  const overlayHref = overlayUrl(snapshot.lobby.code);
  const chromaHref = overlayUrl(snapshot.lobby.code, true);
  const moveLocked = Boolean(selectedMove || myMatch?.lockedPlayerIds?.includes(session.playerId));

  async function copyValue(value: string, ok: string) {
    const copied = await copyText(value);
    showToast(copied ? ok : "Kopyalanamadı — adresi elle kopyala");
  }

  return (
    <div className="app-shell">
      {view !== "overlay" && (
        <header className="topbar">
          <button className="brand-button" type="button" onClick={() => setView("lobby")}>
            <span>RPS</span>
            <strong>ARENA</strong>
          </button>
          <nav className="top-nav" aria-label="Ana görünüm">
            <NavButton active={view === "lobby"} icon={<Users size={16} />} label="Lobi" onClick={() => setView("lobby")} />
            {isAdmin && (
              <NavButton
                active={view === "admin"}
                icon={<LayoutDashboard size={16} />}
                label="Yönetim"
                onClick={() => setView("admin")}
              />
            )}
            <NavButton
              active={view === "match"}
              icon={<Gamepad2 size={16} />}
              label="Maçım"
              onClick={() => setView("match")}
            />
            <NavButton
              active={view === "bracket"}
              icon={<Brackets size={16} />}
              label="Tablo"
              onClick={() => setView("bracket")}
            />
            <NavButton
              active={view === "result"}
              icon={<Trophy size={16} />}
              label="Şampiyon"
              onClick={() => setView("result")}
            />
            {isAdmin && (
              <NavButton
                active={false}
                icon={<Monitor size={16} />}
                label="Yayın"
                onClick={() => setView("overlay")}
              />
            )}
          </nav>
          <div className="live-pill">
            <span className={connected ? "live-dot" : "live-dot offline"} />
            {connected
              ? (snapshot.tournament?.phases[snapshot.tournament.currentPhaseIndex]?.name ?? "Lobi")
              : "Kopuk"}
          </div>
        </header>
      )}

      <div className={`content-shell ${view === "overlay" ? "overlay-mode" : ""} ${mobilePane === "live" ? "show-live" : "show-main"}`}>
        <div className="mobile-rail-tabs" role="tablist">
          <button className={mobilePane === "main" ? "active" : ""} type="button" onClick={() => setMobilePane("main")}>
            {view === "match" ? "Maçım" : view === "admin" ? "Yönetim" : view === "bracket" ? "Tablo" : "Lobi"}
          </button>
          <button className={mobilePane === "live" ? "active" : ""} type="button" onClick={() => setMobilePane("live")}>
            Canlı
          </button>
        </div>
        <section className="main-surface">
          {view === "lobby" && (
            <LobbyPage
              lobby={snapshot.lobby}
              playerId={session.playerId}
              isAdmin={isAdmin}
              tournament={snapshot.tournament}
              onCopyCode={() => void copyValue(snapshot.lobby.code, "Lobi kodu kopyalandı")}
              onCopyJoinUrl={() => void copyValue(`${window.location.origin}/?code=${snapshot.lobby.code}`, "Katılım linki kopyalandı")}
              onReady={() => socket.emit("lobby:ready")}
              onKick={(playerId) => socket.emit("admin:kickPlayer", { playerId })}
            />
          )}
          {view === "admin" && isAdmin && (
            <AdminPage
              snapshot={snapshot}
              overlayUrl={overlayHref}
              chromaUrl={chromaHref}
              onAdvancePhase={() => socket.emit("admin:advancePhase")}
              onAssignWinner={(matchId, winnerId) => socket.emit("admin:assignWinner", { matchId, winnerId })}
              onAddTestPlayer={() => socket.emit("admin:addTestPlayer")}
              onRestartMatch={(matchId) => socket.emit("admin:restartMatch", { matchId })}
              onSeed={() => socket.emit("admin:tournamentSeed")}
              onShowChampion={() => socket.emit("admin:showChampion")}
              onStartTestTournament={() => {
                socket.emit("admin:startTestTournament");
                setView("bracket");
              }}
              onStartPhase={() => socket.emit("admin:phaseStart")}
              onStartTournament={() => socket.emit("admin:tournamentStart")}
              onPausePhase={() => {
                if (currentPhase) socket.emit("admin:phasePause", { phaseId: currentPhase.id });
              }}
              onResumePhase={() => {
                if (currentPhase) socket.emit("admin:phaseResume", { phaseId: currentPhase.id });
              }}
              onClearFeed={() => socket.emit("admin:clearFeed")}
              onUpdateRoom={(patch) => socket.emit("admin:updateRoom", patch)}
              onCopyOverlay={() => void copyValue(overlayHref, "Overlay URL kopyalandı")}
            />
          )}
          {view === "match" && (
            <MatchPage
              match={myMatch}
              playerId={session.playerId}
              selectedMove={selectedMove}
              moveLocked={moveLocked}
              reveal={reveal}
              settings={roomSettings(snapshot.lobby)}
              onMove={(matchId, move) => {
                setSelectedMove(move);
                socket.emit("match:move", { matchId, move });
              }}
            />
          )}
          {view === "bracket" && (
            <BracketPage bracket={snapshot.bracket} playerId={session.playerId} tournament={snapshot.tournament} />
          )}
          {view === "result" && <ResultPage snapshot={snapshot} />}
          {view === "overlay" && (
            <OverlayPage
              snapshot={snapshot}
              overlayUrl={overlayHref}
              chromaUrl={chromaHref}
              onCopyOverlay={() => void copyValue(overlayHref, "Overlay URL kopyalandı")}
              onOpenOverlay={() => window.open(overlayHref, "_blank")}
            />
          )}
        </section>

        {view !== "overlay" && (
          <aside className="side-rail">
            <ActiveMatchesPanel matches={snapshot.activeMatches} />
            <ActivityFeed events={snapshot.feed} />
          </aside>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
