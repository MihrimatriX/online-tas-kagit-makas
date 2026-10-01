import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";
import { MemoryStore } from "../state/memory-store.js";
import { schedulePersist } from "../state/persist.js";
import { nowIso } from "../tournament/bracket.service.js";
import { ActivityFeedEvent, Lobby } from "../tournament/tournament.types.js";

export interface SocketContext {
  io: Server;
  store: MemoryStore;
}

export type AppSocket = Socket;

export const lobbyRoom = (lobbyId: string) => `lobby:${lobbyId}`;

const pendingSnapshots = new Set<string>();

/**
 * Broadcasts the lobby state. Calls in the same tick collapse into one emit, so a burst
 * (32 matches timing out together, a phase advancing) costs one broadcast instead of dozens.
 */
export function emitSnapshot(context: SocketContext, lobbyId: string) {
  const lobby = context.store.lobbies.get(lobbyId);
  if (lobby) lobby.lastActiveAt = nowIso();
  if (pendingSnapshots.has(lobbyId)) return;
  pendingSnapshots.add(lobbyId);
  setImmediate(() => {
    pendingSnapshots.delete(lobbyId);
    if (!context.store.lobbies.has(lobbyId)) return;
    context.io.to(lobbyRoom(lobbyId)).emit("tournament:snapshot", context.store.buildSnapshot(lobbyId));
    schedulePersist(context.store);
  });
}

/** Records a feed line; it reaches clients with the next snapshot. */
export function emitFeed(context: SocketContext, event: ActivityFeedEvent) {
  context.store.addFeed(event);
}

export function emitError(socket: AppSocket, error: unknown) {
  const message =
    error instanceof ZodError ? "Geçersiz istek" : error instanceof Error ? error.message : "Beklenmeyen bir hata oldu";
  socket.emit("app:error", { message });
}

/** Registers a handler whose thrown errors go back to the caller as `app:error`. */
export function handle(socket: AppSocket, event: string, handler: (payload: unknown) => void) {
  socket.on(event, (payload: unknown) => {
    try {
      handler(payload);
    } catch (error) {
      emitError(socket, error);
    }
  });
}

export function socketOf(context: SocketContext, lobby: Lobby, playerId: string) {
  const socketId = lobby.players.find((player) => player.id === playerId)?.socketId;
  return socketId ? context.io.sockets.sockets.get(socketId) : undefined;
}

export function requirePlayer(socket: AppSocket, context: SocketContext) {
  const session = context.store.getSession(socket.id);
  const lobby = session.lobbyId ? context.store.lobbies.get(session.lobbyId) : undefined;
  const player = lobby?.players.find((candidate) => candidate.id === session.playerId);
  if (!lobby || !player) throw new Error("Aktif lobi oturumu yok");
  return { session, lobby, player };
}

export function requireAdmin(socket: AppSocket, context: SocketContext) {
  const found = requirePlayer(socket, context);
  if (found.player.id !== found.lobby.adminPlayerId) throw new Error("Bu işlem için admin olmalısın");
  return found;
}

export function requireTournament(context: SocketContext, lobby: Lobby) {
  const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
  if (!tournament) throw new Error("Henüz eşleşme çekilmedi");
  return tournament;
}
