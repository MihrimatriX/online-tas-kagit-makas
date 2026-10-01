import { useEffect, useState } from "react";
import { Lobby, RoomSettings } from "../../types";

export type RoomPatch = Partial<RoomSettings> & { name?: string; overlayEnabled?: boolean };

interface AdminRoomSettingsProps {
  lobby: Lobby;
  locked: boolean;
  onUpdate: (patch: RoomPatch) => void;
}

export function AdminRoomSettings({ lobby, locked, onUpdate }: AdminRoomSettingsProps) {
  const [name, setName] = useState(lobby.name);
  const settings = lobby.settings;

  useEffect(() => setName(lobby.name), [lobby.name]);

  const saveName = () => {
    const next = name.trim();
    if (next && next !== lobby.name) onUpdate({ name: next });
    else setName(lobby.name);
  };

  return (
    <section>
      <header className="sheet-head">
        <h2>Oda ayarları</h2>
        <span>{locked ? "Kurallar kilitli" : "Kuradan önce değişir"}</span>
      </header>
      <div className="settings">
        <label className="field">
          <span className="field__label">Oda adı</span>
          <input
            className="input"
            maxLength={32}
            onBlur={saveName}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            value={name}
          />
        </label>
        <Choices
          disabled={locked}
          label="Maçı kazanmak için"
          onPick={(value) => onUpdate({ winningScore: value })}
          options={[2, 3, 4, 5].map((value) => ({ value, label: `İlk ${value}` }))}
          value={settings.winningScore}
        />
        <Choices
          disabled={locked}
          label="Hamle süresi"
          onPick={(value) => onUpdate({ moveSeconds: value })}
          options={[5, 8, 10, 15, 20].map((value) => ({ value, label: `${value} sn` }))}
          value={settings.moveSeconds}
        />
        <Choices
          disabled={locked}
          label="Maç öncesi geri sayım"
          onPick={(value) => onUpdate({ countdownSeconds: value })}
          options={[0, 3, 5].map((value) => ({ value, label: value ? `${value} sn` : "Yok" }))}
          value={settings.countdownSeconds}
        />
        <Choices
          label="Tur bitince"
          onPick={(value) => onUpdate({ autoAdvance: value === 1 })}
          options={[
            { value: 0, label: "Ben başlatırım" },
            { value: 1, label: "Kendiliğinden geç" }
          ]}
          value={settings.autoAdvance ? 1 : 0}
        />
      </div>
      {locked && <p className="section-note">Kura çekildikten sonra puan ve süreler değişmez; oda adı ve tur geçişi değişebilir.</p>}
    </section>
  );
}

interface ChoicesProps {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  disabled?: boolean;
  onPick: (value: number) => void;
}

function Choices({ label, value, options, disabled, onPick }: ChoicesProps) {
  return (
    <fieldset className="choices" disabled={disabled}>
      <legend className="field__label">{label}</legend>
      <div className="choices__row">
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className="choice"
            key={option.value}
            onClick={() => option.value !== value && onPick(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
