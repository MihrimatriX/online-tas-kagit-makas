import {
  ActivityFeedEvent,
  AdminAction,
  ClientSession,
  Lobby,
  Match,
  Player,
  Tournament,
  TournamentSnapshot,
  defaultRoomSettings,
  normalizeRoomSettings
} from "../tournament/tournament.types.js";
import { buildBracketSnapshot, createId, nowIso } from "../tournament/bracket.service.js";

const RANDOM_LOBBY_CAPACITY = 8;
const MAX_LOBBY_PLAYERS = 64;
const DEFAULT_LOBBY_NAME = "Taş Kağıt Makas";

export interface RoomPatch {
  name?: string;
  overlayEnabled?: boolean;
  winningScore?: number;
  moveSeconds?: number;
  countdownSeconds?: number;
  autoAdvance?: boolean;
}

export class MemoryStore {
  readonly lobbies = new Map<string, Lobby>();
  readonly lobbiesByCode = new Map<string, string>();
  readonly tournaments = new Map<string, Tournament>();
  readonly matches = new Map<string, Match>();
  readonly feedByLobby = new Map<string, ActivityFeedEvent[]>();
  readonly adminActionsByTournament = new Map<string, AdminAction[]>();
  readonly sessions = new Map<string, ClientSession>();

  getSession(socketId: string) {
    let session = this.sessions.get(socketId);
    if (!session) {
      session = { socketId, playerId: null, lobbyId: null };
      this.sessions.set(socketId, session);
    }
    return session;
  }

  /** Drops the socket's session; the player goes offline only if this socket still owns them. */
  removeSession(socketId: string) {
    const session = this.sessions.get(socketId);
    this.sessions.delete(socketId);
    const player = session ? this.findPlayer(session.lobbyId, session.playerId) : undefined;
    const ownedPlayer = player?.socketId === socketId ? player : undefined;
    if (ownedPlayer) {
      ownedPlayer.socketId = null;
      ownedPlayer.connectionStatus = "offline";
    }
    return { session, player: ownedPlayer };
  }

  createLobby(socketId: string, playerName: string) {
    const player = createPlayer(socketId, playerName, true);
    const createdAt = nowIso();
    const lobby: Lobby = {
      id: createId("lobby"),
      code: createLobbyCode(this.lobbiesByCode),
      name: DEFAULT_LOBBY_NAME,
      status: "waiting",
      adminPlayerId: player.id,
      players: [player],
      tournamentId: null,
      overlayEnabled: true,
      settings: defaultRoomSettings(),
      createdAt,
      lastActiveAt: createdAt
    };

    this.lobbies.set(lobby.id, lobby);
    this.lobbiesByCode.set(lobby.code, lobby.id);
    this.feedByLobby.set(lobby.id, []);
    this.attachSession(socketId, lobby.id, player.id);
    return { lobby, player };
  }

  joinRandomLobby(socketId: string, playerName: string) {
    const candidates = Array.from(this.lobbies.values()).filter(
      (lobby) =>
        lobby.status === "waiting" &&
        !lobby.isTest &&
        !lobby.tournamentId &&
        lobby.players.length < RANDOM_LOBBY_CAPACITY &&
        lobby.players.some((player) => player.connectionStatus === "online") &&
        !hasName(lobby, playerName)
    );
    if (candidates.length === 0) return this.createLobby(socketId, playerName);
    const lobby = candidates[Math.floor(Math.random() * candidates.length)];
    return this.addPlayer(socketId, lobby, playerName);
  }

  joinLobby(socketId: string, code: string, playerName: string) {
    const lobby = this.findLobbyByCode(code);
    if (!lobby) throw new Error("Bu kodla bir lobi yok");
    if (lobby.tournamentId || lobby.status !== "waiting") throw new Error("Bu lobide turnuva başladı, yeni oyuncu alınmıyor");
    return this.addPlayer(socketId, lobby, playerName);
  }

  addTestPlayers(lobbyId: string, count: number) {
    const lobby = this.requireLobby(lobbyId);
    if (lobby.tournamentId) throw new Error("Eşleşmeler çekildikten sonra bot eklenemez");
    const room = MAX_LOBBY_PLAYERS - lobby.players.length;
    if (room <= 0) throw new Error(`Lobi dolu (${MAX_LOBBY_PLAYERS} oyuncu)`);

    const added: Player[] = [];
    let serial = lobby.players.filter((player) => player.isTest).length;
    while (added.length < Math.min(count, room)) {
      serial += 1;
      const name = `Bot ${String(serial).padStart(2, "0")}`;
      if (hasName(lobby, name)) continue;
      const bot = createPlayer(null, name, false, true);
      lobby.players.push(bot);
      added.push(bot);
    }
    lobby.isTest = true;
    return added;
  }

  validateReconnect(lobbyCode: string, playerId: string, reconnectToken: string) {
    const lobby = this.findLobbyByCode(lobbyCode);
    const player = lobby?.players.find((candidate) => candidate.id === playerId);
    if (!lobby || !player?.reconnectToken || player.reconnectToken !== reconnectToken) return null;
    return { lobby, player };
  }

  attachSession(socketId: string, lobbyId: string, playerId: string) {
    const session = this.getSession(socketId);
    session.lobbyId = lobbyId;
    session.playerId = playerId;
    session.isSpectator = false;
    const player = this.findPlayer(lobbyId, playerId);
    if (player) {
      player.socketId = socketId;
      player.connectionStatus = "online";
    }
  }

  attachSpectator(socketId: string, lobbyId: string) {
    const session = this.getSession(socketId);
    session.lobbyId = lobbyId;
    session.playerId = null;
    session.isSpectator = true;
  }

  /** Before pairings the player disappears; afterwards they stay on the sheet, eliminated. */
  removePlayer(lobbyId: string, playerId: string) {
    const lobby = this.requireLobby(lobbyId);
    const player = lobby.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("Oyuncu bulunamadı");
    const socketId = player.socketId;
    // A kicked or departed player must not be able to reconnect with their old token.
    delete player.reconnectToken;

    if (lobby.tournamentId) {
      player.socketId = null;
      player.connectionStatus = "offline";
      player.isEliminated = true;
      player.isReady = false;
    } else {
      lobby.players = lobby.players.filter((candidate) => candidate.id !== playerId);
    }
    return { player, socketId };
  }

  /** Hands admin to the first online human if the current admin is gone. */
  promoteAdmin(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    const current = lobby.players.find((player) => player.id === lobby.adminPlayerId);
    if (current?.connectionStatus === "online") return null;

    const next = lobby.players.find((player) => player.connectionStatus === "online" && !player.isTest);
    if (!next || next.id === current?.id) return null;
    this.setAdmin(lobby, next.id);
    return next;
  }

  /** Waiting lobbies drop offline humans; a lobby with no humans left is deleted. */
  compactWaitingLobby(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== "waiting" || lobby.tournamentId) return;

    const humansOnline = lobby.players.filter((player) => !player.isTest && player.connectionStatus === "online");
    if (humansOnline.length === 0) {
      this.deleteLobby(lobbyId);
      return;
    }
    lobby.players = lobby.players.filter((player) => player.isTest || player.connectionStatus === "online");
    if (!humansOnline.some((player) => player.id === lobby.adminPlayerId)) this.setAdmin(lobby, humansOnline[0].id);
  }

  deleteTournament(tournamentId: string) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;
    for (const phase of tournament.phases) phase.matchIds.forEach((matchId) => this.matches.delete(matchId));
    this.tournaments.delete(tournamentId);
    this.adminActionsByTournament.delete(tournamentId);
    const lobby = this.lobbies.get(tournament.lobbyId);
    if (lobby?.tournamentId === tournamentId) lobby.tournamentId = null;
  }

  deleteLobby(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.tournamentId) this.deleteTournament(lobby.tournamentId);
    this.lobbies.delete(lobbyId);
    this.lobbiesByCode.delete(lobby.code);
    this.feedByLobby.delete(lobbyId);
  }

  clearFeed(lobbyId: string) {
    this.feedByLobby.set(lobbyId, []);
  }

  updateRoom(lobbyId: string, patch: RoomPatch) {
    const lobby = this.requireLobby(lobbyId);
    const changingRules =
      patch.winningScore !== undefined || patch.moveSeconds !== undefined || patch.countdownSeconds !== undefined;
    if (changingRules && lobby.tournamentId) throw new Error("Eşleşmeler çekildikten sonra maç kuralları kilitlenir");

    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, 32);
      if (!name) throw new Error("Oda adı boş olamaz");
      lobby.name = name;
    }
    if (patch.overlayEnabled !== undefined) lobby.overlayEnabled = patch.overlayEnabled;
    lobby.settings = normalizeRoomSettings(patch, lobby.settings);
    return lobby;
  }

  findLobbyByCode(code: string) {
    const lobbyId = this.lobbiesByCode.get(code.trim().toUpperCase());
    return lobbyId ? this.lobbies.get(lobbyId) ?? null : null;
  }

  addFeed(event: ActivityFeedEvent) {
    const events = this.feedByLobby.get(event.lobbyId) ?? [];
    events.unshift(event);
    this.feedByLobby.set(event.lobbyId, events.slice(0, 50));
    return event;
  }

  addAdminAction(action: AdminAction) {
    const actions = this.adminActionsByTournament.get(action.tournamentId) ?? [];
    actions.unshift(action);
    this.adminActionsByTournament.set(action.tournamentId, actions.slice(0, 100));
    return action;
  }

  buildSnapshot(lobbyId: string): TournamentSnapshot {
    const lobby = this.requireLobby(lobbyId);
    const tournament = lobby.tournamentId ? this.tournaments.get(lobby.tournamentId) ?? null : null;
    const bracket = tournament ? buildBracketSnapshot(tournament.phases, this.matches) : [];

    return {
      lobby: {
        ...lobby,
        players: lobby.players.map(({ reconnectToken: _token, socketId: _socket, ...player }) => player)
      },
      tournament,
      bracket,
      activeMatches: bracket
        .flatMap((phase) => phase.matches)
        .filter((match) => match.status === "playing" || match.status === "paused"),
      feed: this.feedByLobby.get(lobbyId) ?? [],
      adminActions: tournament ? this.adminActionsByTournament.get(tournament.id) ?? [] : [],
      serverTime: nowIso()
    };
  }

  private addPlayer(socketId: string, lobby: Lobby, playerName: string) {
    if (lobby.players.length >= MAX_LOBBY_PLAYERS) throw new Error(`Lobi dolu (${MAX_LOBBY_PLAYERS} oyuncu)`);
    const player = createPlayer(socketId, playerName, false);
    if (hasName(lobby, player.name)) throw new Error("Bu isim lobide kullanılıyor, başka bir isim seç");
    lobby.players.push(player);
    this.attachSession(socketId, lobby.id, player.id);
    return { lobby, player };
  }

  private setAdmin(lobby: Lobby, playerId: string) {
    lobby.adminPlayerId = playerId;
    lobby.players.forEach((player) => {
      player.isAdmin = player.id === playerId;
    });
    const tournament = lobby.tournamentId ? this.tournaments.get(lobby.tournamentId) : undefined;
    if (tournament) tournament.adminPlayerId = playerId;
  }

  private requireLobby(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error("Lobi bulunamadı");
    return lobby;
  }

  private findPlayer(lobbyId: string | null, playerId: string | null) {
    if (!lobbyId || !playerId) return undefined;
    return this.lobbies.get(lobbyId)?.players.find((candidate) => candidate.id === playerId);
  }
}

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 18);
  if (!name) throw new Error("Oyuncu adı gerekli");
  return name;
}

function hasName(lobby: Lobby, name: string) {
  const key = name.trim().toLocaleLowerCase("tr-TR");
  return lobby.players.some((player) => player.name.toLocaleLowerCase("tr-TR") === key);
}

function createPlayer(socketId: string | null, playerName: string, isAdmin: boolean, isTest = false): Player {
  return {
    id: createId("player"),
    name: normalizeName(playerName),
    socketId,
    reconnectToken: crypto.randomUUID(),
    isReady: isTest,
    isAdmin,
    isTest,
    isEliminated: false,
    connectionStatus: "online",
    createdAt: nowIso()
  };
}

function createLobbyCode(existingCodes: Map<string, string>) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (existingCodes.has(code));
  return code;
}
