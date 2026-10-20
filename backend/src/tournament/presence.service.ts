import { createAdminAction } from "./admin.service.js";
import { restoreTournamentClocks } from "./flow.service.js";
import { createFeedEvent } from "./live-feed.service.js";
import { cancel, cancelPrefix, clearAllTimers, clearMatchClock, isScheduled, schedule } from "./timer.service.js";
import { emitFeed, emitSnapshot, SocketContext } from "../socket/socket.types.js";

/** A dropped player's slot in a waiting lobby is kept this long for a refresh/reconnect. */
const WAITING_GRACE_MS = 8_000;
/** After a restart every client is offline until it reconnects; give them longer. */
const BOOT_GRACE_MS = 60_000;
const ADMIN_GRACE_MS = 30_000;
/** Lobbies with nobody online and no activity for this long are deleted. */
export const IDLE_LOBBY_MS = 3 * 60 * 60 * 1000;

function scheduleWaitingCompact(context: SocketContext, lobbyId: string, ms = WAITING_GRACE_MS) {
  schedule(`compact:${lobbyId}`, ms, () => {
    context.store.compactWaitingLobby(lobbyId);
    if (context.store.lobbies.has(lobbyId)) emitSnapshot(context, lobbyId);
  });
}

/** Starts the admin hand-off clock while the admin is offline; stops it once they are back. */
export function syncAdminPresence(context: SocketContext, lobbyId: string) {
  const lobby = context.store.lobbies.get(lobbyId);
  const admin = lobby?.players.find((player) => player.id === lobby.adminPlayerId);
  const key = `admin:${lobbyId}`;
  if (!lobby || admin?.connectionStatus === "online") {
    cancel(key);
    return;
  }
  if (!isScheduled(key)) schedule(key, ADMIN_GRACE_MS, () => transferAdmin(context, lobbyId));
}

export function transferAdmin(context: SocketContext, lobbyId: string) {
  const next = context.store.promoteAdmin(lobbyId);
  const lobby = context.store.lobbies.get(lobbyId);
  if (!next || !lobby) return null;

  emitFeed(context, createFeedEvent(lobbyId, "admin_action", `Yönetim ${next.name} oyuncusuna geçti.`));
  const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
  if (tournament) {
    context.store.addAdminAction(createAdminAction(tournament, next.id, "ADMIN_TRANSFERRED", { playerId: next.id }));
  }
  emitSnapshot(context, lobbyId);
  return next;
}

export function handleDisconnect(context: SocketContext, socketId: string) {
  const { session, player } = context.store.removeSession(socketId);
  // Spectators, sockets without a lobby, and sockets already replaced by a newer tab change nothing.
  if (!session?.lobbyId || !player) return;
  const lobby = context.store.lobbies.get(session.lobbyId);
  if (!lobby) return;

  if (!lobby.tournamentId) scheduleWaitingCompact(context, lobby.id);
  syncAdminPresence(context, lobby.id);
  emitSnapshot(context, lobby.id);
}

export function restoreAfterBoot(context: SocketContext) {
  clearAllTimers();
  restoreTournamentClocks(context);
  for (const lobby of context.store.lobbies.values()) {
    if (!lobby.tournamentId) scheduleWaitingCompact(context, lobby.id, BOOT_GRACE_MS);
    syncAdminPresence(context, lobby.id);
  }
}

export function sweepIdleLobbies(context: SocketContext, now = Date.now()) {
  for (const lobby of [...context.store.lobbies.values()]) {
    const someoneOnline = lobby.players.some((player) => !player.isTest && player.connectionStatus === "online");
    if (someoneOnline || now - Date.parse(lobby.lastActiveAt) < IDLE_LOBBY_MS) continue;

    const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
    for (const matchId of tournament?.phases.flatMap((phase) => phase.matchIds) ?? []) {
      const match = context.store.matches.get(matchId);
      if (match) clearMatchClock(match);
    }
    if (tournament) cancel(`advance:${tournament.id}`);
    cancelPrefix(`compact:${lobby.id}`);
    cancelPrefix(`admin:${lobby.id}`);
    context.store.deleteLobby(lobby.id);
  }
}
