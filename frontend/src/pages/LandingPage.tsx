import { FormEvent, useState } from "react";

interface LandingPageProps {
  initialCode?: string;
  connected: boolean;
  restoring: boolean;
  onCreateLobby: (name: string) => void;
  onJoinLobby: (name: string, lobbyCode: string) => void;
  onJoinRandomLobby: (name: string) => void;
}

const NAME_KEY = "rps_last_name";

function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function LandingPage({ initialCode = "", connected, restoring, onCreateLobby, onJoinLobby, onJoinRandomLobby }: LandingPageProps) {
  const [name, setName] = useState(rememberedName);
  const [code, setCode] = useState(initialCode);
  const trimmed = name.trim();
  const ready = Boolean(trimmed) && connected && !restoring;

  function withName(action: (name: string) => void) {
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // ignore
    }
    action(trimmed);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    if (code.trim()) withName((value) => onJoinLobby(value, code.trim()));
    else withName(onCreateLobby);
  }

  return (
    <main className="landing">
      <div className="landing__card card">
        <div className="landing__head">
          <h1 className="wordmark">RPS Arena</h1>
          <p>Arkadaşlarınla eleme usulü taş-kağıt-makas turnuvası. 2–64 oyuncu.</p>
        </div>

        <form className="landing__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Adın</span>
            <input
              autoComplete="nickname"
              autoFocus={!initialCode}
              className="input"
              maxLength={18}
              onChange={(event) => setName(event.target.value)}
              placeholder="Turnuvada görünecek ad"
              value={name}
            />
          </label>
          <label className="field">
            <span className="field__label">
              Lobi kodu <span className="field__optional">(isteğe bağlı)</span>
            </span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus={Boolean(initialCode)}
              className="input input--code"
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="Boş bırakırsan yeni lobi kurulur"
              spellCheck={false}
              value={code}
            />
          </label>

          <button className="btn btn--primary btn--lg btn--block" disabled={!ready} type="submit">
            {code.trim() ? `${code.trim()} lobisine katıl` : "Yeni lobi kur"}
          </button>
          <button className="btn btn--block" disabled={!ready} onClick={() => withName(onJoinRandomLobby)} type="button">
            Açık bir lobiye katıl
          </button>
          <p className="hint">
            {!connected
              ? "Sunucuya bağlanılıyor…"
              : restoring
                ? "Önceki lobine dönülüyor…"
                : "Lobiyi kuran kişi turnuvayı yönetir."}
          </p>
        </form>
      </div>
    </main>
  );
}

export function Wordmark() {
  return <span className="wordmark">RPS Arena</span>;
}
