import { SocketContext, emitFeed, emitSnapshot } from "../socket/socket.types.js";
import { createFeedEvent } from "./live-feed.service.js";
import { assignWinner } from "./match.service.js";
import { clearMatchClock } from "./timer.service.js";
import { processMove } from "../socket/match.events.js";
import {
  broadcastMatchFinished,
  maybeCompleteAndAdvance,
  timeoutForLobby,
  transferAdminIfOffline
} from "./flow.service.js";

const GRACE_PERIOD_MS = 30_000;
const WAITING_COMPACT_MS = 8_000;
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCompacts = new Map<string, ReturnType<typeof setTimeout>>();
const pendingAdminTransfers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDisconnectWalkover(
  context: SocketContext,
  lobbyId: string,
  playerId: string
) {
  const key = `${lobbyId}:${playerId}`;
  if (pendingDisconnects.has(key)) return;

  const timer = setTimeout(() => {
    pendingDisconnects.delete(key);
    handleWalkover(context, lobbyId, playerId);
  }, GRACE_PERIOD_MS);

  pendingDisconnects.set(key, timer);
}

export function cancelDisconnectWalkover(lobbyId: string, playerId: string) {
  const key = `${lobbyId}:${playerId}`;
  const timer = pendingDisconnects.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingDisconnects.delete(key);
  }
}

export function scheduleWaitingCompact(context: SocketContext, lobbyId: string) {
  if (pendingCompacts.has(lobbyId)) return;
  const timer = setTimeout(() => {
    pendingCompacts.delete(lobbyId);
    context.store.compactWaitingLobbyById(lobbyId);
    if (context.store.lobbies.has(lobbyId)) {
      emitSnapshot(context, lobbyId);
    }
  }, WAITING_COMPACT_MS);
  pendingCompacts.set(lobbyId, timer);
}

export function cancelWaitingCompact(lobbyId: string) {
  const timer = pendingCompacts.get(lobbyId);
  if (timer) {
    clearTimeout(timer);
    pendingCompacts.delete(lobbyId);
  }
}

export function scheduleAdminTransfer(context: SocketContext, lobbyId: string) {
  if (pendingAdminTransfers.has(lobbyId)) return;
  const timer = setTimeout(() => {
    pendingAdminTransfers.delete(lobbyId);
    transferAdminIfOffline(context, lobbyId);
  }, GRACE_PERIOD_MS);
  pendingAdminTransfers.set(lobbyId, timer);
}

export function cancelAdminTransfer(lobbyId: string) {
  const timer = pendingAdminTransfers.get(lobbyId);
  if (timer) {
    clearTimeout(timer);
    pendingAdminTransfers.delete(lobbyId);
  }
}

export function handleWalkover(context: SocketContext, lobbyId: string, playerId: string) {
  const lobby = context.store.lobbies.get(lobbyId);
  if (!lobby?.tournamentId) return;

  const tournament = context.store.tournaments.get(lobby.tournamentId);
  if (!tournament || tournament.status !== "active") return;

  const activeMatch = Array.from(context.store.matches.values()).find(
    (match) =>
      match.tournamentId === tournament.id &&
      (match.status === "playing" || match.status === "paused") &&
      (match.player1.id === playerId || match.player2.id === playerId)
  );

  if (!activeMatch) return;

  const winnerId =
    activeMatch.player1.id === playerId ? activeMatch.player2.id : activeMatch.player1.id;

  const winner = [activeMatch.player1, activeMatch.player2].find((player) => player.id === winnerId);
  if (!winner || winner.isBye) return;

  clearMatchClock(activeMatch.id, activeMatch);
  assignWinner(activeMatch, winnerId, "walkover");

  const playerName =
    activeMatch.player1.id === playerId ? activeMatch.player1.name : activeMatch.player2.name;
  emitFeed(
    context,
    createFeedEvent(
      lobbyId,
      "admin_action",
      `${playerName} bağlantısı koptu, ${winner.name} walkover kazandı.`,
      {
        matchId: activeMatch.id,
        phaseId: activeMatch.phaseId
      }
    )
  );
  broadcastMatchFinished(context, lobbyId, activeMatch);

  const phase = tournament.phases.find((candidate) => candidate.id === activeMatch.phaseId);
  if (phase) {
    maybeCompleteAndAdvance(
      context,
      lobbyId,
      tournament,
      phase,
      timeoutForLobby(context, lobbyId, processMove)
    );
  }

  emitSnapshot(context, lobbyId);
}
