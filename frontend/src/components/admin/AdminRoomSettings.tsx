import { useEffect, useState } from "react";
import { Lobby, Tournament } from "../../types";
import { roomSettings } from "../../lib/format";

export interface RoomPatch {
  name?: string;
  overlayEnabled?: boolean;
  winningScore?: number;
  moveSeconds?: number;
  countdownSeconds?: number;
  autoAdvance?: boolean;
}

interface AdminRoomSettingsProps {
  lobby: Lobby;
  tournament: Tournament | null;
  onUpdate: (patch: RoomPatch) => void;
}

export function AdminRoomSettings({ lobby, tournament, onUpdate }: AdminRoomSettingsProps) {
  const settings = roomSettings(lobby);
  const autoAdvance = tournament ? tournament.roundAdvanceMode === "automatic" : settings.autoAdvance;
  const rulesLocked = Boolean(tournament);
  const [name, setName] = useState(lobby.name);

  useEffect(() => {
    setName(lobby.name);
  }, [lobby.name]);

  return (
    <section className="panel">
      <div className="panel-head">
        <span>Oda ayarları</span>
        <span>{rulesLocked ? "Puan ve süre kilitli" : "Maç başlamadan değişir"}</span>
      </div>
      <label>
        Oda adı
        <input
          maxLength={32}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next && next !== lobby.name) onUpdate({ name: next });
          }}
        />
      </label>
      <fieldset className="choice-row" disabled={rulesLocked}>
        <legend>Kaç puanla kazanılır</legend>
        {[2, 3, 4, 5].map((value) => (
          <button
            className={settings.winningScore === value ? "choice active" : "choice"}
            key={value}
            type="button"
            onClick={() => onUpdate({ winningScore: value })}
          >
            İlk {value}
          </button>
        ))}
      </fieldset>
      <fieldset className="choice-row" disabled={rulesLocked}>
        <legend>Hamle süresi</legend>
        {[5, 8, 10, 15, 20].map((value) => (
          <button
            className={settings.moveSeconds === value ? "choice active" : "choice"}
            key={value}
            type="button"
            onClick={() => onUpdate({ moveSeconds: value })}
          >
            {value} sn
          </button>
        ))}
      </fieldset>
      <fieldset className="choice-row" disabled={rulesLocked}>
        <legend>Maç başı geri sayım</legend>
        {[0, 3, 5].map((value) => (
          <button
            className={settings.countdownSeconds === value ? "choice active" : "choice"}
            key={value}
            type="button"
            onClick={() => onUpdate({ countdownSeconds: value })}
          >
            {value === 0 ? "Yok" : `${value} sn`}
          </button>
        ))}
      </fieldset>
      <fieldset className="choice-row">
        <legend>Tur bitince</legend>
        <button
          className={!autoAdvance ? "choice active" : "choice"}
          type="button"
          onClick={() => onUpdate({ autoAdvance: false })}
        >
          Ben onaylarım
        </button>
        <button
          className={autoAdvance ? "choice active" : "choice"}
          type="button"
          onClick={() => onUpdate({ autoAdvance: true })}
        >
          Kendiliğinden geç
        </button>
      </fieldset>
      <fieldset className="choice-row">
        <legend>Yayın ekranı</legend>
        <button
          className={lobby.overlayEnabled !== false ? "choice active" : "choice"}
          type="button"
          onClick={() => onUpdate({ overlayEnabled: true })}
        >
          Açık
        </button>
        <button
          className={lobby.overlayEnabled === false ? "choice active" : "choice"}
          type="button"
          onClick={() => onUpdate({ overlayEnabled: false })}
        >
          Kapalı
        </button>
      </fieldset>
      {rulesLocked && (
        <p className="entry-hint">Eşleşmeler oluştuktan sonra puan ve süre değişmez. Ad, yayın ve tur geçişi değişebilir.</p>
      )}
    </section>
  );
}
