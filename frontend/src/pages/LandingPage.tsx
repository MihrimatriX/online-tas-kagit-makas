import { FormEvent, useState } from "react";
import { LogIn, Plus, Shuffle } from "lucide-react";

interface LandingPageProps {
  initialCode?: string;
  onCreateLobby: (name: string) => void;
  onJoinLobby: (name: string, lobbyCode: string) => void;
  onJoinRandomLobby: (name: string) => void;
}

export function LandingPage({ initialCode = "", onCreateLobby, onJoinLobby, onJoinRandomLobby }: LandingPageProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const hasName = Boolean(name.trim());
  const hasCode = Boolean(code.trim());

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (!hasName || !hasCode) return;
    onJoinLobby(name, code);
  }

  return (
    <main className="entry-shell">
      <section className="entry-panel">
        <h1 className="brand-lockup">
          <span>RPS</span>
          <strong>ARENA</strong>
        </h1>
        <p className="entry-lead">Taş · Kağıt · Makas turnuvası. Adını yaz, lobi kur veya koda katıl.</p>
        <form className="entry-form" onSubmit={handleJoin}>
          <label>
            Adın
            <input maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="Örn. Ali" value={name} />
          </label>
          <label>
            Lobi kodu
            <input
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Arkadaşın verdiyse yaz"
              value={code}
            />
          </label>
          <div className="entry-actions">
            <button className="primary-button" disabled={!hasName || !hasCode} type="submit">
              <LogIn size={16} />
              Koda katıl
            </button>
            <button className="secondary-button" disabled={!hasName} onClick={() => onCreateLobby(name)} type="button">
              <Plus size={16} />
              Yeni lobi kur
            </button>
            <button
              className="ghost-button"
              disabled={!hasName}
              onClick={() => onJoinRandomLobby(name)}
              type="button"
            >
              <Shuffle size={16} />
              Rastgele katıl
            </button>
          </div>
          <p className="entry-hint">Lobi kuran kişi admin olur. Oda adı, puan ve süreleri Yönetim’den ayarlar.</p>
        </form>
      </section>
    </main>
  );
}
