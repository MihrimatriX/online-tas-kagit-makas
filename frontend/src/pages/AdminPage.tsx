import { ExternalLink, Link2, X } from "lucide-react";
import { AdminRoomSettings } from "../components/admin/AdminRoomSettings";
import { adminActionLabel, formatClock, statusLabel } from "../lib/format";
import { SafeMatch, TournamentSnapshot } from "../types";

export type AdminCommand =
  | "admin:seed"
  | "admin:unseed"
  | "admin:start"
  | "admin:quickStart"
  | "admin:pause"
  | "admin:resume"
  | "admin:advance"
  | "admin:newTournament"
  | "admin:assignWinner"
  | "admin:restartMatch"
  | "admin:kick"
  | "admin:clearFeed"
  | "admin:updateRoom"
  | "admin:addBots";

export type SendCommand = (command: AdminCommand, payload?: Record<string, unknown>) => void;

interface Step {
  title: string;
  detail: string;
  primary?: { label: string; command: AdminCommand; disabled?: boolean };
  secondary?: { label: string; command: AdminCommand; payload?: Record<string, unknown> }[];
}

function nextStep({ lobby, tournament, bracket }: TournamentSnapshot): Step {
  if (!tournament) {
    const count = lobby.players.length;
    if (count < 2) {
      return {
        title: "Oyuncu bekleniyor",
        detail: "Kura için en az 2 oyuncu gerekli. Kodu paylaş ya da deneme için bot ekle.",
        secondary: [{ label: "Bot ekle", command: "admin:addBots", payload: { count: 1 } }]
      };
    }
    const waiting = lobby.players.filter((player) => !player.isTest && !player.isReady);
    const size = 2 ** Math.ceil(Math.log2(count));
    const byes = size - count;
    return {
      title: waiting.length ? "Hazır olmayanlar var" : "Kura çekilebilir",
      detail: waiting.length
        ? `Bekleniyor: ${waiting.map((player) => player.name).join(", ")}.`
        : `${count} oyuncu · ${size} kişilik tablo${byes ? `, ${byes} kişi BYE ile tur atlar` : ""}.`,
      primary: { label: "Kurayı çek", command: "admin:seed", disabled: waiting.length > 0 },
      secondary: [{ label: waiting.length ? "Beklemeden başlat" : "Çek ve hemen başlat", command: "admin:quickStart" }]
    };
  }

  const phase = tournament.phases[tournament.currentPhaseIndex];
  const next = tournament.phases[tournament.currentPhaseIndex + 1];
  const matches = bracket.find((column) => column.phaseKey === phase.phaseKey)?.matches ?? [];
  const done = matches.filter((match) => match.status === "finished" || match.status === "walkover").length;

  switch (tournament.status) {
    case "seeded":
      return {
        title: "Eşleşmeler hazır",
        detail: "Tabloyu kontrol et. Başlatınca ilk turun bütün maçları aynı anda açılır.",
        primary: { label: "Turnuvayı başlat", command: "admin:start" },
        secondary: [{ label: "Kurayı boz", command: "admin:unseed" }]
      };
    case "paused":
      return {
        title: "Turnuva duraklatıldı",
        detail: "Süreler durdu, hamle alınmıyor. Devam edince açık roundlar baştan sayar.",
        primary: { label: "Devam et", command: "admin:resume" }
      };
    case "finished":
      return {
        title: "Turnuva bitti",
        detail: `Şampiyon: ${tournament.champion?.name ?? "—"}. Aynı kodla yeni bir turnuva açabilirsin.`,
        primary: { label: "Yeni turnuva", command: "admin:newTournament" }
      };
  }

  if (phase.status === "completed" && next) {
    const auto = lobby.settings.autoAdvance;
    const crowning = next.phaseKey === "champion";
    return {
      title: `${phase.name} bitti`,
      detail: crowning
        ? `Kazanan belli: ${matches[0]?.winner?.name ?? "—"}.${auto ? " Birazdan şampiyon ilan edilecek." : ""}`
        : auto
          ? `${next.name} birkaç saniye içinde kendiliğinden başlar.`
          : `${done} maç tamamlandı. Hazır olunca ${next.name} turunu başlat.`,
      primary: { label: crowning ? "Şampiyonu ilan et" : `${next.name} turunu başlat`, command: "admin:advance" }
    };
  }

  return {
    title: `${phase.name} oynanıyor`,
    detail: `${done}/${matches.length} maç bitti.`,
    secondary: [{ label: "Duraklat", command: "admin:pause" }]
  };
}

export function AdminNextStep({ snapshot, onCommand }: { snapshot: TournamentSnapshot; onCommand: SendCommand }) {
  const step = nextStep(snapshot);
  return (
    <section className="command" aria-label="Yönetici: sıradaki adım">
      <div className="command__text">
        <span className="field__label">Sıradaki adım</span>
        <h2>{step.title}</h2>
        <p>{step.detail}</p>
      </div>
      <div className="command__actions">
        {step.primary && (
          <button
            className="btn btn--primary btn--lg"
            disabled={step.primary.disabled}
            onClick={() => onCommand(step.primary!.command)}
            type="button"
          >
            {step.primary.label}
          </button>
        )}
        {step.secondary?.map((action) => (
          <button className="btn" key={action.label} onClick={() => onCommand(action.command, action.payload)} type="button">
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

interface AdminPageProps {
  snapshot: TournamentSnapshot;
  playerId: string;
  overlayUrl: string;
  chromaUrl: string;
  onCommand: SendCommand;
  onCopyOverlay: () => void;
}

export function AdminPage({ snapshot, playerId, overlayUrl, chromaUrl, onCommand, onCopyOverlay }: AdminPageProps) {
  const { lobby, tournament, bracket, adminActions } = snapshot;
  const current = tournament ? tournament.phases[tournament.currentPhaseIndex] : null;
  const currentMatches =
    tournament && tournament.status !== "finished"
      ? (bracket.find((column) => column.phaseKey === current?.phaseKey)?.matches ?? []).filter((match) => !match.isBye)
      : [];

  const assign = (match: SafeMatch, winnerId: string, name: string) => {
    if (window.confirm(`${name} bu maçın kazananı ilan edilsin mi? Skor ne olursa olsun maç biter.`)) {
      onCommand("admin:assignWinner", { matchId: match.id, winnerId });
    }
  };
  const restart = (match: SafeMatch) => {
    if (window.confirm(`${match.player1.name} – ${match.player2.name} maçı 0–0'dan baştan oynansın mı?`)) {
      onCommand("admin:restartMatch", { matchId: match.id });
    }
  };
  const kick = (id: string, name: string) => {
    const note = tournament ? " Açık maçı varsa rakibine hükmen verilir." : "";
    if (window.confirm(`${name} lobiden çıkarılsın mı?${note}`)) onCommand("admin:kick", { playerId: id });
  };

  return (
    <div className="admin">
      <AdminNextStep onCommand={onCommand} snapshot={snapshot} />

      <div className="admin__grid">
        <div className="admin__col">
          <section>
            <header className="sheet-head">
              <h2>{current ? `${current.name} maçları` : "Maçlar"}</h2>
              <span>{currentMatches.length}</span>
            </header>
            {currentMatches.length === 0 ? (
              <p className="empty-note">Kura çekilince bu turun maçları burada düzeltilebilir.</p>
            ) : (
              <ol className="ctl-list">
                {currentMatches.map((match) => (
                  <li className="ctl-row" key={match.id}>
                    <span className="ctl-row__no">#{match.matchNumber}</span>
                    <span className="ctl-row__match">
                      {match.player1.name} <b>{match.player1.score}–{match.player2.score}</b> {match.player2.name}
                    </span>
                    <span className="ctl-row__status">{statusLabel(match.status)}</span>
                    <span className="ctl-row__actions">
                      <button className="btn btn--sm" onClick={() => assign(match, match.player1.id, match.player1.name)} type="button">
                        {match.player1.name} aldı
                      </button>
                      <button className="btn btn--sm" onClick={() => assign(match, match.player2.id, match.player2.name)} type="button">
                        {match.player2.name} aldı
                      </button>
                      <button className="btn btn--sm btn--quiet" onClick={() => restart(match)} type="button">
                        Baştan
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <header className="sheet-head">
              <h2>Oyuncular</h2>
              <span>{lobby.players.length}</span>
            </header>
            <ul className="ctl-list">
              {lobby.players.map((player) => (
                <li className="ctl-row ctl-row--player" key={player.id}>
                  <span className={`presence${player.isTest || player.connectionStatus === "online" ? "" : " is-off"}`} />
                  <span className="ctl-row__match">
                    {player.name}
                    {player.isAdmin && <small> · yönetici</small>}
                    {player.isTest && <small> · bot</small>}
                  </span>
                  <span className="ctl-row__status">
                    {player.isEliminated ? "Elendi" : player.isTest || player.connectionStatus === "online" ? "Bağlı" : "Koptu"}
                  </span>
                  {player.id !== playerId && !(tournament && player.isEliminated) ? (
                    <button
                      aria-label={`${player.name} oyuncusunu çıkar`}
                      className="icon-btn"
                      onClick={() => kick(player.id, player.name)}
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
            </ul>
          </section>
        </div>

        <div className="admin__col">
          <AdminRoomSettings lobby={lobby} locked={Boolean(tournament)} onUpdate={(patch) => onCommand("admin:updateRoom", patch)} />

          <section>
            <header className="sheet-head">
              <h2>Deneme botları</h2>
              <span>{lobby.players.filter((player) => player.isTest).length} bot</span>
            </header>
            <p className="section-note">Botlar 1–2 saniyede rastgele oynar. Turnuvayı tek başına denemek için ekle.</p>
            <div className="button-row">
              <button className="btn" disabled={Boolean(tournament)} onClick={() => onCommand("admin:addBots", { count: 1 })} type="button">
                +1 bot
              </button>
              <button className="btn" disabled={Boolean(tournament)} onClick={() => onCommand("admin:addBots", { count: 7 })} type="button">
                +7 bot
              </button>
            </div>
          </section>

          <section>
            <header className="sheet-head">
              <h2>Yayın ekranı</h2>
              <span>{lobby.overlayEnabled ? "Açık" : "Kapalı"}</span>
            </header>
            <p className="section-note">OBS’e “tarayıcı kaynağı” olarak ekle. Yeşil fon sürümü chroma key içindir.</p>
            <div className="button-row">
              <button
                className="btn"
                onClick={() => onCommand("admin:updateRoom", { overlayEnabled: !lobby.overlayEnabled })}
                type="button"
              >
                {lobby.overlayEnabled ? "Yayını kapat" : "Yayını aç"}
              </button>
              {lobby.overlayEnabled && (
                <>
                  <a className="btn" href={overlayUrl} rel="noreferrer" target="_blank">
                    <ExternalLink size={16} aria-hidden="true" />
                    Aç
                  </a>
                  <a className="btn" href={chromaUrl} rel="noreferrer" target="_blank">
                    Yeşil fon
                  </a>
                  <button className="btn" onClick={onCopyOverlay} type="button">
                    <Link2 size={16} aria-hidden="true" />
                    Linki kopyala
                  </button>
                </>
              )}
            </div>
          </section>

          <section>
            <header className="sheet-head">
              <h2>İşlem geçmişi</h2>
              <button className="btn btn--sm btn--quiet" onClick={() => onCommand("admin:clearFeed")} type="button">
                Canlı akışı temizle
              </button>
            </header>
            {adminActions.length === 0 ? (
              <p className="empty-note">Turnuva işlemleri burada listelenir.</p>
            ) : (
              <ol className="log">
                {adminActions.slice(0, 30).map((action) => (
                  <li key={action.id}>
                    <time dateTime={action.createdAt}>{formatClock(action.createdAt)}</time>
                    <span>{adminActionLabel(action.actionType)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
