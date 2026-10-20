import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Volume2, VolumeX } from "lucide-react";
import type { Socket } from "socket.io-client";
import { LiveBracket } from "./components/bracket/LiveBracket";
import { ActiveMatchesPanel } from "./components/live/ActiveMatchesPanel";
import { ActivityFeed } from "./components/live/ActivityFeed";
import { syncServerClock } from "./lib/clock";
import { copyText, joinUrl, overlayUrl, readRoute } from "./lib/format";
import { applyClientSeo } from "./lib/seo";
import { clearSession, loadSession, saveSession } from "./lib/session";
import { socket } from "./lib/socket";
import { isMuted, setMuted, soundAssigned, soundLose, soundReveal, soundWin } from "./lib/sound";
import { AdminNextStep, AdminPage, SendCommand } from "./pages/AdminPage";
import { LandingPage, Wordmark } from "./pages/LandingPage";
import { LobbyPage } from "./pages/LobbyPage";
import { MatchPage, PlayerStatus } from "./pages/MatchPage";
import { SpectatorOverlay } from "./pages/OverlayPage";
import { ResultPage } from "./pages/ResultPage";
import { SessionState, TournamentSnapshot } from "./types";

type Tab = "arena" | "bracket" | "admin";

export function App() {
  const route = useMemo(readRoute, []);
  if (route.overlayCode) return <SpectatorOverlay chroma={route.chroma} code={route.overlayCode} />;
  return <PlayerApp initialCode={route.joinCode} />;
}

function PlayerApp({ initialCode }: { initialCode: string }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("arena");
  const [toast, setToast] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  // Another tab took this session over; socket.io won't reconnect on its own after a server-side disconnect.
  const [takenOver, setTakenOver] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [restoring, setRestoring] = useState(() => Boolean(loadSession()));
  const toastTimer = useRef<number | undefined>(undefined);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }

  useEffect(() => {
    const reset = (message?: string) => {
      clearSession();
      setRestoring(false);
      setSession(null);
      setSnapshot(null);
      setTab("arena");
      if (message) showToast(message);
    };
    const reconnect = () => {
      const saved = loadSession();
      if (saved) socket.emit("session:reconnect", saved);
    };

    // socket.io listener signature; payload shapes are typed per handler below.
    const handlers: Record<string, (...args: any[]) => void> = {
      connect: () => {
        setConnected(true);
        setTakenOver(false);
        reconnect();
      },
      disconnect: (reason: Socket.DisconnectReason) => {
        setConnected(false);
        // TODO(human): decide when this disconnect means "another tab took the session" → setTakenOver(...)
      },
      "session:ready": (payload: SessionState) => {
        saveSession(payload);
        setRestoring(false);
        setSession(payload);
      },
      "session:invalid": () => reset(loadSession() ? "Önceki oturumun sona ermiş. Yeniden katılabilirsin." : undefined),
      "session:left": () => reset(),
      "session:kicked": () => reset("Yönetici seni lobiden çıkardı."),
      "tournament:snapshot": (payload: TournamentSnapshot) => {
        syncServerClock(payload.serverTime);
        setSnapshot(payload);
      },
      "match:assigned": () => {
        setTab("arena");
        soundAssigned();
      },
      "match:finished": ({ winnerId }: { winnerId?: string }) => {
        if (winnerId === loadSession()?.playerId) soundWin();
        else soundLose();
      },
      "tournament:winner": () => {
        setTab("arena");
        soundWin();
      },
      "app:error": ({ message }: { message: string }) => showToast(message)
    };

    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    if (socket.connected) reconnect();
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
    };
  }, []);

  useEffect(() => {
    const origin = window.location.origin;
    if (snapshot && session) {
      applyClientSeo({
        title: `${snapshot.lobby.name} · ${snapshot.lobby.code} — RPS Arena`,
        description: `${snapshot.lobby.players.length} oyuncu · ${snapshot.lobby.name} lobisi. Kod: ${snapshot.lobby.code}`,
        url: joinUrl(snapshot.lobby.code)
      });
    } else if (initialCode) {
      applyClientSeo({
        title: `Lobi ${initialCode} — RPS Arena`,
        description: `RPS Arena lobisine davetlisin. Kod: ${initialCode}`,
        url: joinUrl(initialCode)
      });
    } else {
      applyClientSeo({ url: `${origin}/` });
    }
  }, [initialCode, session, snapshot]);

  const myMatch = useMemo(() => {
    if (!snapshot || !session) return null;
    return (
      snapshot.activeMatches.find(
        (match) => match.player1.id === session.playerId || match.player2.id === session.playerId
      ) ?? null
    );
  }, [snapshot, session]);

  // Reveal sound when a round in my match resolves.
  const roundsSeen = useRef(0);
  useEffect(() => {
    const count = myMatch?.rounds.length ?? 0;
    if (count > roundsSeen.current) soundReveal();
    roundsSeen.current = count;
  }, [myMatch?.id, myMatch?.rounds.length]);

  if (!session || !snapshot || snapshot.lobby.id !== session.lobbyId) {
    return (
      <>
        <LandingPage
          connected={connected}
          restoring={restoring}
          initialCode={initialCode}
          onCreateLobby={(name) => socket.emit("lobby:create", { name })}
          onJoinLobby={(name, lobbyCode) => socket.emit("lobby:join", { name, lobbyCode })}
          onJoinRandomLobby={(name) => socket.emit("lobby:joinRandom", { name })}
        />
        <Toast message={toast} />
      </>
    );
  }

  const { lobby, tournament } = snapshot;
  const isAdmin = session.playerId === lobby.adminPlayerId;
  const phase = tournament?.phases[tournament.currentPhaseIndex];
  const activeTab = tab === "admin" && !isAdmin ? "arena" : tab;

  const send: SendCommand = (command, payload) => socket.emit(command, payload ?? {});
  const copy = async (value: string, ok: string) => showToast((await copyText(value)) ? ok : "Kopyalanamadı, adresi elle kopyala");
  const leave = () => {
    const warning =
      tournament && tournament.status !== "finished"
        ? "Turnuvadan çekilirsen açık maçın rakibine hükmen verilir. Ayrılmak istiyor musun?"
        : "Lobiden ayrılmak istiyor musun?";
    if (window.confirm(warning)) socket.emit("lobby:leave");
  };
  const kick = (playerId: string, name: string) => {
    if (window.confirm(`${name} lobiden çıkarılsın mı?`)) send("admin:kick", { playerId });
  };

  let arena;
  if (!tournament) {
    arena = (
      <LobbyPage
        isAdmin={isAdmin}
        lobby={lobby}
        onCopyCode={() => void copy(lobby.code, "Lobi kodu kopyalandı")}
        onCopyLink={() => void copy(joinUrl(lobby.code), "Davet linki kopyalandı")}
        onKick={kick}
        onReady={() => socket.emit("lobby:ready")}
        playerId={session.playerId}
      />
    );
  } else if (tournament.status === "finished") {
    arena = (
      <ResultPage
        isAdmin={isAdmin}
        onOpenBracket={() => setTab("bracket")}
        playerId={session.playerId}
        snapshot={snapshot}
      />
    );
  } else if (myMatch) {
    arena = (
      <MatchPage
        match={myMatch}
        onMove={(matchId, move) => socket.emit("match:move", { matchId, move })}
        playerId={session.playerId}
        settings={lobby.settings}
      />
    );
  } else {
    arena = (
      <PlayerStatus
        autoAdvance={lobby.settings.autoAdvance}
        bracket={snapshot.bracket}
        onOpenBracket={() => setTab("bracket")}
        playerId={session.playerId}
        tournament={tournament}
      />
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__row">
          <Wordmark />
          <div className="masthead__lobby">
            <strong>{lobby.name}</strong>
            <span className="masthead__code">{lobby.code}</span>
          </div>
          <span className="masthead__phase">
            <span className={`presence${connected ? "" : " is-off"}`} />
            {takenOver ? (
              <>
                Başka bir sekmede açık
                <button className="btn btn--sm btn--quiet" onClick={() => socket.connect()} type="button">
                  Burada devam et
                </button>
              </>
            ) : !connected
              ? "Bağlantı koptu, yeniden bağlanılıyor…"
              : tournament?.status === "finished"
                ? "Turnuva bitti"
                : tournament?.status === "paused"
                  ? `${phase?.name} · duraklatıldı`
                  : tournament?.status === "seeded"
                    ? "Kura çekildi"
                    : (phase?.name ?? "Lobi")}
          </span>
          <div className="masthead__tools">
            <button
              aria-label={muted ? "Sesi aç" : "Sesi kapat"}
              aria-pressed={muted}
              className="icon-btn"
              onClick={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
              title={muted ? "Sesi aç" : "Sesi kapat"}
              type="button"
            >
              {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            </button>
            <button aria-label="Lobiden ayrıl" className="btn btn--sm btn--quiet" onClick={leave} type="button">
              <LogOut size={16} aria-hidden="true" />
              <span className="masthead__leave">Ayrıl</span>
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Görünüm">
          <TabButton active={activeTab === "arena"} label={myMatch ? "Maçın" : "Arena"} live={Boolean(myMatch)} onClick={() => setTab("arena")} />
          <TabButton active={activeTab === "bracket"} label="Tablo" onClick={() => setTab("bracket")} />
          {isAdmin && <TabButton active={activeTab === "admin"} label="Yönetim" onClick={() => setTab("admin")} />}
        </nav>
      </header>

      <div className="workspace">
        <main className="stage">
          {activeTab === "arena" && (
            <>
              {isAdmin && !myMatch && <AdminNextStep onCommand={send} snapshot={snapshot} />}
              {arena}
            </>
          )}
          {activeTab === "bracket" && (
            <LiveBracket bracket={snapshot.bracket} playerId={session.playerId} tournament={tournament} />
          )}
          {activeTab === "admin" && (
            <AdminPage
              chromaUrl={overlayUrl(lobby.code, true)}
              onCommand={send}
              onCopyOverlay={() => void copy(overlayUrl(lobby.code), "Yayın linki kopyalandı")}
              overlayUrl={overlayUrl(lobby.code)}
              playerId={session.playerId}
              snapshot={snapshot}
            />
          )}
        </main>
        <aside className="rail">
          {snapshot.activeMatches.length > 0 && <ActiveMatchesPanel limit={8} matches={snapshot.activeMatches} />}
          <ActivityFeed events={snapshot.feed} limit={25} />
        </aside>
      </div>
      <Toast message={toast} />
    </div>
  );
}

function TabButton({ active, label, live, onClick }: { active: boolean; label: string; live?: boolean; onClick: () => void }) {
  return (
    <button aria-current={active ? "page" : undefined} className="tab" onClick={onClick} type="button">
      {label}
      {live && <span className="tab__live" aria-label="canlı" />}
    </button>
  );
}

function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" className="toast-region" role="status">
      {message && <p className="toast">{message}</p>}
    </div>
  );
}
