import { Bot, Check, Circle, Copy, Link2, Shield, X } from "lucide-react";
import { Lobby, Tournament } from "../types";
import { statusLabel, roomSettings } from "../lib/format";

interface LobbyPageProps {
  lobby: Lobby;
  tournament: Tournament | null;
  playerId: string | null;
  isAdmin: boolean;
  onReady: () => void;
  onCopyCode: () => void;
  onCopyJoinUrl: () => void;
  onKick: (playerId: string) => void;
}

export function LobbyPage({
  lobby,
  tournament,
  playerId,
  isAdmin,
  onReady,
  onCopyCode,
  onCopyJoinUrl,
  onKick
}: LobbyPageProps) {
  const me = lobby.players.find((player) => player.id === playerId);
  const waitingPlayers = lobby.players.filter((player) => !player.isTest && !player.isReady);
  const readyCount = lobby.players.filter((player) => player.isReady || player.isTest).length;
  const settings = roomSettings(lobby);

  const othersWaiting = waitingPlayers.filter((player) => player.id !== playerId);

  const hint = tournament
    ? tournament.status === "finished"
      ? "Turnuva bitti. Şampiyonu Sonuç sekmesinden görebilirsin."
      : "Maçın gelince Maçım sekmesine geç. Tabloyu da oradan izleyebilirsin."
    : isAdmin
      ? othersWaiting.length
        ? `Herkes Hazırım desin (${othersWaiting.map((player) => player.name).join(", ")} bekleniyor). Sonra Yönetim’den eşleşmeleri oluştur.`
        : me?.isReady
          ? "Herkes hazır. Yönetim sekmesinden eşleşmeleri oluştur, sonra turnuvayı başlat."
          : "Sen de Hazırım de. Sonra Yönetim’den eşleşmeleri oluştur."
      : me?.isReady
        ? "Hazırsın. Admin’in turnuvayı başlatması bekleniyor."
        : "Kodu arkadaşlarınla paylaş. Hazırsan aşağıdaki butona bas.";

  return (
    <main className="page-stack">
      <section className="hero-band">
        <div>
          <span className="eyebrow">{lobby.name}</span>
          <h1>{lobby.code}</h1>
          <p className="hero-rules">
            İlk {settings.winningScore} puan · {settings.moveSeconds} sn hamle
            {settings.countdownSeconds ? ` · ${settings.countdownSeconds} sn geri sayım` : ""}
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={onCopyCode} type="button">
            <Copy size={16} />
            Kodu kopyala
          </button>
          <button className="secondary-button" onClick={onCopyJoinUrl} type="button">
            <Link2 size={16} />
            Linki kopyala
          </button>
        </div>
      </section>

      <p className="hint-banner">{hint}</p>

      <section className="panel">
        <div className="panel-head">
          <span>Oyuncular</span>
          <span>
            {lobby.players.length} kişi · {readyCount} hazır
          </span>
        </div>
        <div className="player-grid">
          {lobby.players.map((player) => (
            <article className={`player-card ${player.id === playerId ? "current-player" : ""} ${player.isEliminated ? "eliminated" : ""}`} key={player.id}>
              <div>
                <strong>
                  {player.name}
                  {player.id === playerId ? " (sen)" : ""}
                </strong>
                <span>
                  {player.isEliminated
                    ? "elendi"
                    : player.isTest
                      ? "bot"
                      : player.connectionStatus === "online"
                        ? "bağlı"
                        : "koptu"}
                </span>
              </div>
              <div className="player-tags">
                {player.isAdmin && (
                  <span className="tag">
                    <Shield size={12} />
                    Admin
                  </span>
                )}
                {player.isTest && (
                  <span className="tag">
                    <Bot size={12} />
                    Bot
                  </span>
                )}
                <span className={player.isReady ? "tag ready" : "tag muted"}>
                  {player.isReady ? <Check size={12} /> : <Circle size={12} />}
                  {player.isReady ? "Hazır" : "Hazır değil"}
                </span>
                {isAdmin && player.id !== playerId && !player.isEliminated && (
                  <button className="kick-button" type="button" onClick={() => onKick(player.id)} title="Oyuncuyu çıkar">
                    <X size={12} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel action-row">
        <div>
          <strong>{tournament ? statusLabel(tournament.status) : "Turnuva henüz başlamadı"}</strong>
          <span>{tournament ? "Maçlar ve tablo üst menüde." : "Hazır olunca admin başlatır."}</span>
        </div>
        <button className="primary-button" disabled={Boolean(tournament)} onClick={onReady} type="button">
          {me?.isReady ? "Hazır değilim" : "Hazırım"}
        </button>
      </section>
    </main>
  );
}
