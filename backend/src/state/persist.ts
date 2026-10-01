import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MemoryStore } from "./memory-store.js";
import type { ActivityFeedEvent, AdminAction, Lobby, Match, Tournament } from "../tournament/tournament.types.js";
import { normalizeRoomSettings } from "../tournament/tournament.types.js";

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
    matches: Array.from(store.matches.values()).map(stripClocks),
    feeds: Array.from(store.feedByLobby.entries()),
    adminActions: Array.from(store.adminActionsByTournament.entries())
  };
}

/** Loads persisted state, filling fields that older files may lack. Timers are re-armed separately. */
export function hydrateStore(store: MemoryStore, data: PersistedState) {
  store.lobbies.clear();
  store.lobbiesByCode.clear();
  store.tournaments.clear();
  store.matches.clear();
  store.feedByLobby.clear();
  store.adminActionsByTournament.clear();
  store.sessions.clear();

  const now = new Date().toISOString();
  for (const lobby of data.lobbies) {
    const clean = stripSockets(lobby);
    clean.overlayEnabled = lobby.overlayEnabled !== false;
    clean.name = lobby.name?.trim() || "Taş Kağıt Makas";
    clean.settings = normalizeRoomSettings(lobby.settings);
    clean.lastActiveAt = lobby.lastActiveAt ?? now;
    store.lobbies.set(clean.id, clean);
    store.lobbiesByCode.set(clean.code, clean.id);
  }
  for (const tournament of data.tournaments) store.tournaments.set(tournament.id, tournament);
  for (const match of data.matches) store.matches.set(match.id, stripClocks(match));
  for (const [lobbyId, events] of data.feeds) store.feedByLobby.set(lobbyId, events);
  for (const [tournamentId, actions] of data.adminActions) store.adminActionsByTournament.set(tournamentId, actions);
}

export function loadPersistedStore(store: MemoryStore, filePath = defaultDataPath()) {
  if (!existsSync(filePath)) return false;
  const data = JSON.parse(readFileSync(filePath, "utf8")) as PersistedState;
  if (data.version !== 1) throw new Error(`Unsupported store version: ${String(data.version)}`);
  hydrateStore(store, data);
  return true;
}

export function savePersistedStore(store: MemoryStore, filePath = defaultDataPath()) {
  if (process.env.PERSIST === "0") return;
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(serializeStore(store)));
  renameSync(tmp, filePath);
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersist(store: MemoryStore, filePath = defaultDataPath()) {
  if (process.env.PERSIST === "0" || persistTimer) return;
  // ponytail: debounced disk writes; ceiling = 500ms of state lost on a hard crash (SIGTERM flushes).
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
    players: lobby.players.map((player) => ({ ...player, socketId: null, connectionStatus: "offline" as const }))
  };
}

function stripClocks(match: Match): Match {
  return { ...match, pendingMoves: {}, missedMoves: match.missedMoves ?? {}, roundEndsAt: null, countdownEndsAt: null };
}
