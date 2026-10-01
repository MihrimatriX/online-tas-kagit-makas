import { FormEvent, useState } from "react";
import { MoveIcon } from "../components/MoveIcon";

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
    <div className="landing">
      <header className="landing__mast">
        <Wordmark />
        <span className="landing__tagline">Canlı eleme turnuvası</span>
      </header>

      <main className="landing__body">
        <section className="landing__pitch">
          <h1 className="landing__title">
            Taş, kağıt, makas.
            <span>Son kalan kazanır.</span>
          </h1>
          <div className="landing__glyphs" aria-hidden="true">
            <MoveIcon move="rock" size={56} />
            <MoveIcon move="paper" size={56} />
            <MoveIcon move="scissors" size={56} />
          </div>
          <ol className="steps">
            <li>
              <p>
                <strong>Lobi kur</strong> ve kodu arkadaşlarına gönder. 2 ile 64 kişi arası.
              </p>
            </li>
            <li>
              <p>
                <strong>Herkes hazır</strong> deyince kura çekilir; sayı tutmazsa birkaç kişi BYE ile tur atlar.
              </p>
            </li>
            <li>
              <p>
                <strong>Maçı alan</strong> tur atlar (varsayılan: ilk 3 puan). Final sonunda tek kişi kalır.
              </p>
            </li>
          </ol>
        </section>

        <form className="slip" onSubmit={handleSubmit}>
          <h2 className="slip__title">Katılım fişi</h2>
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
            <span className="field__label">Lobi kodu</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus={Boolean(initialCode)}
              className="input input--code"
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="Varsa yaz, yoksa boş bırak"
              spellCheck={false}
              value={code}
            />
          </label>

          <div className="slip__actions">
            {code.trim() ? (
              <button className="btn btn--ink btn--lg" disabled={!ready} type="submit">
                {code.trim()} lobisine katıl
              </button>
            ) : (
              <button className="btn btn--ink btn--lg" disabled={!ready} type="submit">
                Yeni lobi kur
              </button>
            )}
            <button className="btn btn--quiet" disabled={!ready} onClick={() => withName(onJoinRandomLobby)} type="button">
              Açık bir lobiye rastgele gir
            </button>
          </div>
          <p className="slip__note">
            {!connected
              ? "Sunucuya bağlanılıyor…"
              : restoring
                ? "Önceki lobine dönülüyor…"
                : "Lobiyi kuran kişi turnuvayı yönetir: kurallar, kura ve tur geçişleri onda."}
          </p>
        </form>
      </main>
    </div>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      RPS<span className="wordmark__slash">/</span>Arena
    </span>
  );
}
