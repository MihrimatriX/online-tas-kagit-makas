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
import { buildBracketSnapshot, createId, nowIso, safeMatch } from "../tournament/bracket.service.js";

const RANDOM_LOBBY_CAPACITY = 8;
const MAX_LOBBY_PLAYERS = 64;

export class MemoryStore {
  readonly lobbies = new Map<string, Lobby>();
  readonly lobbiesByCode = new Map<string, string>();
  readonly tournaments = new Map<string, Tournament>();
  readonly matches = new Map<string, Match>();
  readonly feedByLobby = new Map<string, ActivityFeedEvent[]>();
  readonly adminActionsByTournament = new Map<string, AdminAction[]>();
  readonly sessions = new Map<string, ClientSession>();

  createSession(socketId: string) {
    const session: ClientSession = {
      socketId,
      playerId: null,
      lobbyId: null
    };
    this.sessions.set(socketId, session);
    return session;
  }

  getSession(socketId: string) {
    return this.sessions.get(socketId) ?? this.createSession(socketId);
  }

  removeSession(socketId: string) {
    const session = this.sessions.get(socketId);
    if (session?.lobbyId && session.playerId) {
      const lobby = this.lobbies.get(session.lobbyId);
      const player = lobby?.players.find((candidate) => candidate.id === session.playerId);
      if (player) {
        player.socketId = null;
        player.connectionStatus = "offline";
      }
    }

    this.sessions.delete(socketId);
    return session;
  }

  createLobby(socketId: string, playerName: string) {
    const createdAt = nowIso();
    const player = createPlayer(socketId, playerName, true);
    const lobby: Lobby = {
      id: createId("lobby"),
      code: createLobbyCode(this.lobbiesByCode),
      name: "Taş Kağıt Makas",
      status: "waiting",
      adminPlayerId: player.id,
      players: [player],
      tournamentId: null,
      overlayEnabled: true,
      settings: defaultRoomSettings(),
      createdAt
    };

    this.lobbies.set(lobby.id, lobby);
    this.lobbiesByCode.set(lobby.code, lobby.id);
    this.feedByLobby.set(lobby.id, []);
    this.attachSession(socketId, lobby.id, player.id);
    return { lobby, player };
  }

  joinRandomLobby(socketId: string, playerName: string) {
    const waitingLobbies = Array.from(this.lobbies.values()).filter(
      (lobby) =>
        lobby.status === "waiting" &&
        !lobby.isTest &&
        !lobby.tournamentId &&
        lobby.players.some((player) => player.connectionStatus === "online") &&
        lobby.players.length < RANDOM_LOBBY_CAPACITY
    );

    if (waitingLobbies.length === 0) {
      return {
        ...this.createLobby(socketId, playerName),
        createdLobby: true
      };
    }

    const lobby = waitingLobbies[Math.floor(Math.random() * waitingLobbies.length)];
    const player = createPlayer(socketId, playerName, false);
    assertUniquePlayerName(lobby, player.name);
    lobby.players.push(player);
    this.attachSession(socketId, lobby.id, player.id);

    return {
      lobby,
      player,
      createdLobby: false
    };
  }

  addTestPlayer(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error("Lobby not found");
    if (lobby.status !== "waiting") throw new Error("Test players can only be added before the tournament starts");
    if (lobby.tournamentId) throw new Error("Tournament is already seeded");
    if (lobby.players.length >= MAX_LOBBY_PLAYERS) throw new Error("Lobby already has 64 players");

    const testCount = lobby.players.filter((player) => player.isTest).length + 1;
    const player = createPlayer(null, `Test Oyuncu ${String(testCount).padStart(2, "0")}`, false, true);

    lobby.isTest = true;
    lobby.players.push(player);
    return { lobby, player };
  }

  joinLobby(socketId: string, code: string, playerName: string) {
    const lobby = this.findLobbyByCode(code);
    if (!lobby) throw new Error("Lobby not found");
    if (lobby.status !== "waiting") throw new Error("Lobby is not accepting new players");
    if (lobby.players.length >= MAX_LOBBY_PLAYERS) throw new Error("Lobby already has 64 players");

    const player = createPlayer(socketId, playerName, false);
    assertUniquePlayerName(lobby, player.name);
    lobby.players.push(player);
    this.attachSession(socketId, lobby.id, player.id);
    return { lobby, player };
  }

  validateReconnect(lobbyCode: string, playerId: string, reconnectToken: string) {
    const lobby = this.findLobbyByCode(lobbyCode);
    if (!lobby) return null;
    const player = lobby.players.find((candidate) => candidate.id === playerId);
    if (!player?.reconnectToken || player.reconnectToken !== reconnectToken) return null;
    return { lobby, player };
  }

  attachSession(socketId: string, lobbyId: string, playerId: string) {
    const session = this.getSession(socketId);
    session.lobbyId = lobbyId;
    session.playerId = playerId;

    const lobby = this.lobbies.get(lobbyId);
    const player = lobby?.players.find((candidate) => candidate.id === playerId);
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

  kickPlayer(lobbyId: string, targetId: string, adminId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error("Lobi bulunamadı");
    if (targetId === adminId || targetId === lobby.adminPlayerId) {
      throw new Error("Admin atılamaz");
    }

    const player = lobby.players.find((candidate) => candidate.id === targetId);
    if (!player) throw new Error("Oyuncu bulunamadı");
    if (player.isTest && lobby.tournamentId) {
      throw new Error("Turnuva başladıktan sonra test oyuncusu atılamaz");
    }

    const socketId = player.socketId;
    if (lobby.tournamentId) {
      player.socketId = null;
      player.connectionStatus = "offline";
      player.isEliminated = true;
      player.isReady = false;
    } else {
      lobby.players = lobby.players.filter((candidate) => candidate.id !== targetId);
    }

    return { lobby, player, socketId };
  }

  promoteAdmin(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    const currentAdmin = lobby.players.find((player) => player.id === lobby.adminPlayerId);
    if (currentAdmin?.connectionStatus === "online" && currentAdmin.socketId) return null;

    const next = lobby.players.find(
      (player) => player.connectionStatus === "online" && !player.isTest && Boolean(player.socketId)
    );
    if (!next) return null;

    lobby.adminPlayerId = next.id;
    lobby.players.forEach((player) => {
      player.isAdmin = player.id === next.id;
    });

    if (lobby.tournamentId) {
      const tournament = this.tournaments.get(lobby.tournamentId);
      if (tournament) tournament.adminPlayerId = next.id;
    }

    return next;
  }

  compactWaitingLobbyById(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (lobby) this.compactWaitingLobby(lobby);
  }

  clearFeed(lobbyId: string) {
    this.feedByLobby.set(lobbyId, []);
  }

  updateRoom(lobbyId: string, patch: {
    name?: string;
    overlayEnabled?: boolean;
    winningScore?: number;
    moveSeconds?: number;
    countdownSeconds?: number;
    autoAdvance?: boolean;
  }) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error("Lobi bulunamadı");

    const changingRules =
      patch.winningScore !== undefined ||
      patch.moveSeconds !== undefined ||
      patch.countdownSeconds !== undefined;
    if (changingRules && lobby.tournamentId) {
      throw new Error("Turnuva başladıktan sonra maç kuralları kilitlenir");
    }

    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, 32);
      if (!name) throw new Error("Oda adı gerekli");
      lobby.name = name;
    }

    if (patch.overlayEnabled !== undefined) {
      lobby.overlayEnabled = patch.overlayEnabled;
    }

    lobby.settings = normalizeRoomSettings(patch, lobby.settings ?? defaultRoomSettings());

    if (patch.autoAdvance !== undefined && lobby.tournamentId) {
      const tournament = this.tournaments.get(lobby.tournamentId);
      if (tournament) {
        tournament.roundAdvanceMode = patch.autoAdvance ? "automatic" : "hybrid";
      }
    }

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
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) throw new Error("Lobby not found");

    const tournament = lobby.tournamentId ? this.tournaments.get(lobby.tournamentId) ?? null : null;
    const bracket = tournament ? buildBracketSnapshot(tournament.phases, this.matches) : [];
    const activeMatches = tournament
      ? Array.from(this.matches.values())
          .filter(
            (match) =>
              match.tournamentId === tournament.id &&
              (match.status === "playing" || match.status === "paused")
          )
          .map(safeMatch)
      : [];
    const feed = this.feedByLobby.get(lobbyId) ?? [];
    const adminActions = tournament ? this.adminActionsByTournament.get(tournament.id) ?? [] : [];

    return {
      lobby: {
        ...lobby,
        players: lobby.players.map(({ reconnectToken: _token, ...player }) => player)
      },
      tournament,
      bracket,
      activeMatches,
      feed,
      adminActions
    };
  }

  private compactWaitingLobby(lobby: Lobby) {
    if (lobby.status !== "waiting" || lobby.tournamentId) return;

    const realOnlinePlayers = lobby.players.filter(
      (player) => player.connectionStatus === "online" && !player.isTest && Boolean(player.socketId)
    );

    if (realOnlinePlayers.length === 0) {
      this.lobbies.delete(lobby.id);
      this.lobbiesByCode.delete(lobby.code);
      this.feedByLobby.delete(lobby.id);
      return;
    }

    lobby.players = lobby.players.filter(
      (player) => player.isTest || realOnlinePlayers.some((onlinePlayer) => onlinePlayer.id === player.id)
    );

    const currentAdmin = realOnlinePlayers.find((player) => player.id === lobby.adminPlayerId);
    if (!currentAdmin) {
      lobby.adminPlayerId = realOnlinePlayers[0].id;
    }

    lobby.players.forEach((player) => {
      player.isAdmin = player.id === lobby.adminPlayerId;
    });
  }
}

function normalizeName(value: string) {
  const name = value.trim().slice(0, 18);
  if (!name) throw new Error("Oyuncu adı gerekli");
  return name;
}

function assertUniquePlayerName(lobby: Lobby, name: string) {
  const key = name.toLocaleLowerCase("tr-TR");
  if (lobby.players.some((player) => player.name.toLocaleLowerCase("tr-TR") === key)) {
    throw new Error("Bu isim lobide kullanılıyor");
  }
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
