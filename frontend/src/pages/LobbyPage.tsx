import { Check, Copy, Link2, X } from "lucide-react";
import { Lobby } from "../types";

interface LobbyPageProps {
  lobby: Lobby;
  playerId: string;
  isAdmin: boolean;
  onReady: () => void;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onKick: (playerId: string, name: string) => void;
}

export function LobbyPage({ lobby, playerId, isAdmin, onReady, onCopyCode, onCopyLink, onKick }: LobbyPageProps) {
  const me = lobby.players.find((player) => player.id === playerId);
  const humans = lobby.players.filter((player) => !player.isTest);
  const readyCount = lobby.players.filter((player) => player.isReady || player.isTest).length;
  const { winningScore, moveSeconds, countdownSeconds, autoAdvance } = lobby.settings;

  return (
    <div className="lobby">
      <section className="lobby__code" aria-label="Lobi kodu">
        <span className="field__label">Lobi kodu</span>
        <p className="code-mega">{lobby.code}</p>
        <div className="button-row">
          <button className="btn" onClick={onCopyCode} type="button">
            <Copy size={16} aria-hidden="true" />
            Kodu kopyala
          </button>
          <button className="btn" onClick={onCopyLink} type="button">
            <Link2 size={16} aria-hidden="true" />
            Davet linki
          </button>
        </div>
        <dl className="rules">
          <div>
            <dt>Maç</dt>
            <dd>İlk {winningScore} puan</dd>
          </div>
          <div>
            <dt>Hamle</dt>
            <dd>{moveSeconds} sn</dd>
          </div>
          <div>
            <dt>Geri sayım</dt>
            <dd>{countdownSeconds ? `${countdownSeconds} sn` : "Yok"}</dd>
          </div>
          <div>
            <dt>Tur geçişi</dt>
            <dd>{autoAdvance ? "Otomatik" : "Yönetici onaylar"}</dd>
          </div>
        </dl>
      </section>

      <section className="lobby__roster">
        <header className="sheet-head">
          <h2>Oyuncular</h2>
          <span>
            {lobby.players.length} kişi · {readyCount} hazır
          </span>
        </header>
        <ol className="roster">
          {lobby.players.map((player, index) => (
            <li className={`roster__row${player.id === playerId ? " is-me" : ""}`} key={player.id}>
              <span className="roster__no">{String(index + 1).padStart(2, "0")}</span>
              <span className="roster__name">
                <span
                  className={`presence${player.isTest || player.connectionStatus === "online" ? "" : " is-off"}`}
                  title={player.isTest ? "Bot" : player.connectionStatus === "online" ? "Bağlı" : "Bağlantı koptu"}
                />
                {player.name}
                {player.id === playerId && <small>sen</small>}
                {player.isAdmin && <small>yönetici</small>}
                {player.isTest && <small>bot</small>}
              </span>
              <span className={`roster__state${player.isReady ? " is-ready" : ""}`}>
                {player.isReady ? (
                  <>
                    <Check size={14} aria-hidden="true" /> Hazır
                  </>
                ) : (
                  "Bekleniyor"
                )}
              </span>
              {isAdmin && player.id !== playerId ? (
                <button
                  aria-label={`${player.name} oyuncusunu çıkar`}
                  className="icon-btn"
                  onClick={() => onKick(player.id, player.name)}
                  title="Lobiden çıkar"
                  type="button"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
        {humans.length === 1 && (
          <p className="empty-note">
            Şimdilik tek başınasın. Kodu paylaş{isAdmin ? " ya da Yönetim’den bot ekleyip dene" : ""}.
          </p>
        )}
      </section>

      {me && (
        <section className="lobby__ready">
          <p>
            {me.isReady
              ? isAdmin
                ? "Hazırsın. Herkes hazır olunca kurayı çekebilirsin."
                : "Hazırsın. Yöneticinin kurayı çekmesi bekleniyor."
              : "Hazır olduğunda bas. Herkes hazır olunca kura çekilir."}
          </p>
          <button aria-pressed={me.isReady} className={`btn btn--lg ${me.isReady ? "" : "btn--ink"}`} onClick={onReady} type="button">
            {me.isReady ? "Hazır değilim" : "Hazırım"}
          </button>
        </section>
      )}
    </div>
  );
}
