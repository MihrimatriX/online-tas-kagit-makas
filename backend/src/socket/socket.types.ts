import type { Server, Socket } from "socket.io";
import { MemoryStore } from "../state/memory-store.js";
import { schedulePersist } from "../state/persist.js";
import { ActivityFeedEvent, TournamentSnapshot } from "../tournament/tournament.types.js";

export interface SocketContext {
  io: Server;
  store: MemoryStore;
}

export type AppSocket = Socket;

export const lobbyRoom = (lobbyId: string) => `lobby:${lobbyId}`;
export const matchRoom = (matchId: string) => `match:${matchId}`;

export function emitSnapshot(context: SocketContext, lobbyId: string) {
  const snapshot: TournamentSnapshot = context.store.buildSnapshot(lobbyId);
  context.io.to(lobbyRoom(lobbyId)).emit("tournament:snapshot", snapshot);
  schedulePersist(context.store);
}

export function emitFeed(context: SocketContext, event: ActivityFeedEvent) {
  context.store.addFeed(event);
  context.io.to(lobbyRoom(event.lobbyId)).emit("live:activityFeed", event);
}

export function emitError(socket: AppSocket, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  socket.emit("app:error", { message });
}
