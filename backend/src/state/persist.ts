import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MemoryStore } from "./memory-store.js";
import type {
  ActivityFeedEvent,
  AdminAction,
  Lobby,
  Match,
  Tournament
} from "../tournament/tournament.types.js";
import { defaultRoomSettings, normalizeRoomSettings } from "../tournament/tournament.types.js";

export interface PersistedState {
  version: 1;
  lobbies: Lobby[];
  tournaments: Tournament[];
  matches: Match[];
  feeds: [string, ActivityFeedEvent[]][];
  adminActions: [string, AdminAction[]][];
}

export function defaultDataPath() {
  return process.env.DATA_FILE ?? join(process.cwd(), "data", "store.json");
}

export function serializeStore(store: MemoryStore): PersistedState {
  return {
    version: 1,
    lobbies: Array.from(store.lobbies.values()).map(stripSockets),
    tournaments: Array.from(store.tournaments.values()),
    matches: Array.from(store.matches.values()).map((match) => ({
      ...match,
      pendingMoves: {},
      roundEndsAt: null,
      countdownEndsAt: null
    })),
    feeds: Array.from(store.feedByLobby.entries()),
    adminActions: Array.from(store.adminActionsByTournament.entries())
  };
}

export function hydrateStore(store: MemoryStore, data: PersistedState) {
  store.lobbies.clear();
  store.lobbiesByCode.clear();
  store.tournaments.clear();
  store.matches.clear();
  store.feedByLobby.clear();
  store.adminActionsByTournament.clear();
  store.sessions.clear();

  for (const lobby of data.lobbies) {
    const clean = stripSockets(lobby);
    clean.overlayEnabled = lobby.overlayEnabled !== false;
    clean.name = lobby.name?.trim() || "Taş Kağıt Makas";
    clean.settings = normalizeRoomSettings(lobby.settings, defaultRoomSettings());
    clean.players = clean.players.map((player) => ({
      ...player,
      reconnectToken: player.reconnectToken ?? crypto.randomUUID()
    }));
    store.lobbies.set(clean.id, clean);
    store.lobbiesByCode.set(clean.code, clean.id);
  }

  for (const tournament of data.tournaments) {
    store.tournaments.set(tournament.id, tournament);
  }

  for (const match of data.matches) {
    store.matches.set(match.id, {
      ...match,
      pendingMoves: {},
      roundEndsAt: null,
      countdownEndsAt: null
    });
  }

  for (const [lobbyId, events] of data.feeds) {
    store.feedByLobby.set(lobbyId, events);
  }

  for (const [tournamentId, actions] of data.adminActions) {
    store.adminActionsByTournament.set(tournamentId, actions);
  }
}

export function loadPersistedStore(store: MemoryStore, filePath = defaultDataPath()) {
  if (!existsSync(filePath)) return false;
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as PersistedState;
  if (data.version !== 1) throw new Error(`Unsupported store version: ${String(data.version)}`);
  hydrateStore(store, data);
  return true;
}

export function savePersistedStore(store: MemoryStore, filePath = defaultDataPath()) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(serializeStore(store)));
  renameSync(tmp, filePath);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersist(store: MemoryStore, filePath = defaultDataPath()) {
  if (process.env.PERSIST === "0") return;
  if (persistTimer) clearTimeout(persistTimer);
  // ponytail: debounce disk writes; ceiling = 500ms data loss on crash
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      savePersistedStore(store, filePath);
    } catch (error) {
      console.error("persist failed", error);
    }
  }, 500);
}

function stripSockets(lobby: Lobby): Lobby {
  return {
    ...lobby,
    players: lobby.players.map((player) => ({
      ...player,
      socketId: null,
      connectionStatus: "offline" as const
    }))
  };
}
