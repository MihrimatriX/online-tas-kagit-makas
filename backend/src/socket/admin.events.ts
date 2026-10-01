import { z } from "zod";
import { createAdminAction } from "../tournament/admin.service.js";
import {
  advanceTournament,
  assignMatchWinner,
  forfeitPlayer,
  pauseTournament,
  resetForNewTournament,
  restartMatch,
  resumeTournament,
  scheduleAutoAdvance,
  seedTournament,
  startTournament,
  unseedTournament
} from "../tournament/flow.service.js";
import { createFeedEvent } from "../tournament/live-feed.service.js";
import { getCurrentPhase } from "../tournament/phase.service.js";
import { Lobby, Tournament } from "../tournament/tournament.types.js";
import {
  AppSocket,
  emitFeed,
  emitSnapshot,
  handle,
  lobbyRoom,
  requireAdmin,
  requireTournament,
  SocketContext
} from "./socket.types.js";

const matchSchema = z.object({ matchId: z.string() });
const assignSchema = z.object({ matchId: z.string(), winnerId: z.string() });
const playerSchema = z.object({ playerId: z.string() });
const botsSchema = z.object({ count: z.number().int().min(1).max(63).default(1) });
const roomSchema = z
  .object({
    name: z.string().trim().min(1).max(32),
    overlayEnabled: z.boolean(),
    winningScore: z.number().int().min(2).max(5),
    moveSeconds: z.number().int().min(5).max(20),
    countdownSeconds: z.number().int().min(0).max(5),
    autoAdvance: z.boolean()
  })
  .partial();

export function registerAdminEvents(socket: AppSocket, context: SocketContext) {
  /** Admin command on the lobby itself. */
  const lobbyCommand = (event: string, run: (lobby: Lobby, payload: unknown) => void) =>
    handle(socket, event, (payload) => {
      const { lobby } = requireAdmin(socket, context);
      run(lobby, payload);
      emitSnapshot(context, lobby.id);
    });

  /** Admin command that needs a seeded tournament. */
  const tournamentCommand = (event: string, run: (lobby: Lobby, tournament: Tournament, payload: unknown) => void) =>
    lobbyCommand(event, (lobby, payload) => run(lobby, requireTournament(context, lobby), payload));

  lobbyCommand("admin:addBots", (lobby, payload) => {
    const { count } = botsSchema.parse(payload ?? {});
    const bots = context.store.addTestPlayers(lobby.id, count);
    const label = bots.length === 1 ? bots[0].name : `${bots.length} bot`;
    emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${label} lobiye eklendi.`));
  });

  lobbyCommand("admin:seed", (lobby) => {
    seedTournament(context, lobby);
  });

  tournamentCommand("admin:unseed", (lobby, tournament) => unseedTournament(context, lobby, tournament));
  tournamentCommand("admin:start", (lobby, tournament) => startTournament(context, lobby, tournament));
  tournamentCommand("admin:pause", (lobby, tournament) => pauseTournament(context, lobby, tournament));
  tournamentCommand("admin:resume", (lobby, tournament) => resumeTournament(context, lobby, tournament));
  tournamentCommand("admin:advance", (lobby, tournament) => advanceTournament(context, lobby, tournament));
  tournamentCommand("admin:newTournament", (lobby, tournament) => resetForNewTournament(context, lobby, tournament));

  // Skips the ready check: pairs whoever is in the room and starts immediately.
  lobbyCommand("admin:quickStart", (lobby) => {
    const tournament = lobby.tournamentId
      ? requireTournament(context, lobby)
      : seedTournament(context, lobby, { ignoreReady: true });
    startTournament(context, lobby, tournament);
  });

  tournamentCommand("admin:assignWinner", (lobby, tournament, payload) => {
    const { matchId, winnerId } = assignSchema.parse(payload);
    assignMatchWinner(context, lobby, tournament, matchId, winnerId);
  });

  tournamentCommand("admin:restartMatch", (lobby, tournament, payload) => {
    restartMatch(context, lobby, tournament, matchSchema.parse(payload).matchId);
  });

  lobbyCommand("admin:kick", (lobby, payload) => {
    const { playerId } = playerSchema.parse(payload);
    if (playerId === lobby.adminPlayerId) throw new Error("Kendini atamazsın");

    const { player, socketId } = context.store.removePlayer(lobby.id, playerId);
    forfeitPlayer(context, lobby, playerId, "kicked");
    if (socketId) {
      // Keep the socket alive so the kicked client can join another lobby without reloading.
      const target = context.io.sockets.sockets.get(socketId);
      const session = context.store.getSession(socketId);
      session.lobbyId = null;
      session.playerId = null;
      target?.leave(lobbyRoom(lobby.id));
      target?.emit("session:kicked");
    }
    const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
    if (tournament) {
      context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "PLAYER_KICKED", { playerId }));
    }
    emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${player.name} lobiden çıkarıldı.`));
  });

  lobbyCommand("admin:clearFeed", (lobby) => {
    context.store.clearFeed(lobby.id);
    const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
    if (tournament) context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "FEED_CLEARED"));
  });

  lobbyCommand("admin:updateRoom", (lobby, payload) => {
    const patch = roomSchema.parse(payload ?? {});
    context.store.updateRoom(lobby.id, patch);
    const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
    if (tournament) {
      context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "ROOM_UPDATED", patch));
      // Switching auto-advance on while a finished round is waiting should not need another click.
      if (patch.autoAdvance && tournament.status === "active" && getCurrentPhase(tournament).status === "completed") {
        scheduleAutoAdvance(context, lobby.id, tournament.id);
      }
    }
    if (patch.overlayEnabled === false) dropSpectators(context, lobby.id);
  });
}

function dropSpectators(context: SocketContext, lobbyId: string) {
  for (const session of context.store.sessions.values()) {
    if (!session.isSpectator || session.lobbyId !== lobbyId) continue;
    const socket = context.io.sockets.sockets.get(session.socketId);
    socket?.leave(lobbyRoom(lobbyId));
    socket?.emit("app:error", { message: "Bu lobinin yayın ekranı kapatıldı" });
    session.lobbyId = null;
  }
}
