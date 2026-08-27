import { z } from "zod";
import { createAdminAction, assertAdmin } from "../tournament/admin.service.js";
import {
  buildTournamentPhases,
  createInitialPhaseMatches,
  createId,
  getBracketSize,
  nowIso
} from "../tournament/bracket.service.js";
import { clearMatchClock } from "../tournament/timer.service.js";
import { processMove } from "./match.events.js";
import { collectPhaseWinners, getCurrentPhase, getNextPhase, getPhaseMatches } from "../tournament/phase.service.js";
import { assignWinner, resetMatch } from "../tournament/match.service.js";
import {
  byeAdvanceEvent,
  createFeedEvent,
  phaseWaitingEvent,
  tournamentWinnerEvent
} from "../tournament/live-feed.service.js";
import { Tournament } from "../tournament/tournament.types.js";
import {
  advancePhase,
  broadcastMatchFinished,
  clearMatchElimination,
  maybeCompleteAndAdvance,
  startPhasePlay,
  startPlayableMatch,
  timeoutForLobby
} from "../tournament/flow.service.js";
import {
  AppSocket,
  emitError,
  emitFeed,
  emitSnapshot,
  SocketContext
} from "./socket.types.js";
import { handleWalkover } from "../tournament/disconnect.service.js";

const phaseIdSchema = z.object({
  phaseId: z.string().optional()
});

const assignWinnerSchema = z.object({
  matchId: z.string(),
  winnerId: z.string(),
  reason: z.string().optional()
});

const restartMatchSchema = z.object({
  matchId: z.string()
});

const playerIdSchema = z.object({
  playerId: z.string()
});

const advanceModeSchema = z.object({
  mode: z.enum(["hybrid", "automatic"])
});

const overlaySchema = z.object({
  enabled: z.boolean()
});

const roomSchema = z.object({
  name: z.string().min(1).max(32).optional(),
  overlayEnabled: z.boolean().optional(),
  winningScore: z.number().int().min(2).max(5).optional(),
  moveSeconds: z.number().int().min(5).max(20).optional(),
  countdownSeconds: z.number().int().min(0).max(5).optional(),
  autoAdvance: z.boolean().optional()
});

export function registerAdminEvents(socket: AppSocket, context: SocketContext) {
  socket.on("admin:addTestPlayer", () => {
    try {
      const { lobby, playerId } = getAdminContext(socket, context);
      assertAdmin(playerId, lobby);

      const { player } = context.store.addTestPlayer(lobby.id);
      emitFeed(
        context,
        createFeedEvent(lobby.id, "admin_action", `${player.name} test odasına eklendi.`)
      );
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:tournamentSeed", () => {
    try {
      seedTournament(socket, context);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:tournamentStart", () => {
    try {
      startTournament(socket, context);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:phaseStart", (payload) => {
    try {
      phaseIdSchema.parse(payload ?? {});
      startCurrentPhase(socket, context);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:startTestTournament", () => {
    try {
      const { lobby } = getAdminContext(socket, context);
      lobby.players.forEach((player) => {
        player.isReady = true;
      });
      seedTournament(socket, context, { skipReady: true });
      startTournament(socket, context);
      startCurrentPhase(socket, context);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:advancePhase", () => {
    try {
      const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
      assertAdmin(playerId, lobby);
      advancePhase(context, lobby.id, tournament);
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:showChampion", () => {
    try {
      const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
      assertAdmin(playerId, lobby);
      const champion = tournament.champion;
      if (!champion) throw new Error("Şampiyon henüz hazır değil");

      tournament.status = "finished";
      tournament.updatedAt = nowIso();
      lobby.status = "finished";
      const phase = getCurrentPhase(tournament);
      phase.status = "completed";
      phase.completedAt = nowIso();

      context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "CHAMPION_SHOWN"));
      emitFeed(context, tournamentWinnerEvent(lobby.id, champion));
      context.io.to(`lobby:${lobby.id}`).emit("tournament:winner", { champion });
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:assignWinner", (payload) => {
    try {
      const { matchId, winnerId, reason } = assignWinnerSchema.parse(payload);
      const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
      assertAdmin(playerId, lobby);
      const match = context.store.matches.get(matchId);
      if (!match || match.tournamentId !== tournament.id) throw new Error("Maç bulunamadı");
      if (match.player1.isBye || match.player2.isBye) throw new Error("BYE maçına kazanan atanamaz");
      if (match.phaseId !== getCurrentPhase(tournament).id) {
        throw new Error("Sadece mevcut aşamadaki maça kazanan atanabilir");
      }

      clearMatchClock(match.id, match);
      assignWinner(match, winnerId, reason === "walkover" ? "walkover" : "finished");
      context.store.addAdminAction(
        createAdminAction(tournament, lobby.adminPlayerId, "MATCH_WINNER_ASSIGNED", {
          matchId,
          winnerId,
          reason: reason ?? "manual"
        })
      );
      broadcastMatchFinished(context, lobby.id, match);

      const phase = tournament.phases.find((candidate) => candidate.id === match.phaseId);
      if (phase) {
        maybeCompleteAndAdvance(
          context,
          lobby.id,
          tournament,
          phase,
          timeoutForLobby(context, lobby.id, processMove)
        );
      }
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:restartMatch", (payload) => {
    try {
      const { matchId } = restartMatchSchema.parse(payload);
      const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
      assertAdmin(playerId, lobby);
      const match = context.store.matches.get(matchId);
      if (!match || match.tournamentId !== tournament.id) throw new Error("Maç bulunamadı");
      if (match.isBye) throw new Error("BYE maçları yeniden başlatılamaz");

      const phase = tournament.phases.find((candidate) => candidate.id === match.phaseId);
      if (!phase || phase.id !== getCurrentPhase(tournament).id) {
        throw new Error("Sadece mevcut aşamadaki maç yeniden başlatılabilir");
      }
      if (getNextPhase(tournament)?.matchIds.length) {
        throw new Error("Sonraki aşama kurulduktan sonra maç resetlenemez");
      }

      clearMatchClock(match.id, match);
      clearMatchElimination(context, lobby.id, match);
      resetMatch(match);

      if (phase.status === "completed") {
        phase.status = "active";
        phase.completedAt = null;
        phase.winners = collectPhaseWinners(getPhaseMatches(phase, context.store.matches));
      }

      if (tournament.status === "active" && phase.status === "active") {
        startPlayableMatch(context, match, timeoutForLobby(context, lobby.id, processMove));
      }

      context.store.addAdminAction(
        createAdminAction(tournament, lobby.adminPlayerId, "MATCH_RESTARTED", { matchId })
      );
      emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${match.phaseName} maçı yeniden başlatıldı.`, {
        matchId,
        phaseId: match.phaseId
      }));
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:kickPlayer", (payload) => {
    try {
      const { playerId: targetId } = playerIdSchema.parse(payload);
      const { lobby, playerId } = getAdminContext(socket, context);
      assertAdmin(playerId, lobby);
      if (!playerId) throw new Error("Unauthorized admin action");

      const { player, socketId } = context.store.kickPlayer(lobby.id, targetId, playerId);
      if (socketId) {
        const targetSocket = context.io.sockets.sockets.get(socketId);
        targetSocket?.emit("app:error", { message: "Admin seni lobiden attı" });
        targetSocket?.disconnect(true);
      }

      if (lobby.tournamentId) {
        handleWalkover(context, lobby.id, targetId);
      }

      if (lobby.tournamentId) {
        const tournament = context.store.tournaments.get(lobby.tournamentId);
        if (tournament) {
          context.store.addAdminAction(
            createAdminAction(tournament, lobby.adminPlayerId, "PLAYER_KICKED", { playerId: targetId })
          );
        }
      }

      emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${player.name} lobiden atıldı.`));
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:clearFeed", () => {
    try {
      const { lobby, playerId } = getAdminContext(socket, context);
      assertAdmin(playerId, lobby);
      context.store.clearFeed(lobby.id);
      if (lobby.tournamentId) {
        const tournament = context.store.tournaments.get(lobby.tournamentId);
        if (tournament) {
          context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "FEED_CLEARED"));
        }
      }
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:updateRoom", (payload) => {
    try {
      const patch = roomSchema.parse(payload ?? {});
      applyRoomUpdate(socket, context, patch);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:setAdvanceMode", (payload) => {
    try {
      const { mode } = advanceModeSchema.parse(payload);
      applyRoomUpdate(socket, context, { autoAdvance: mode === "automatic" });
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:setOverlayEnabled", (payload) => {
    try {
      const { enabled } = overlaySchema.parse(payload);
      applyRoomUpdate(socket, context, { overlayEnabled: enabled });
    } catch (error) {
      emitError(socket, error);
    }
  });
}

function seedTournament(socket: AppSocket, context: SocketContext, options: { skipReady?: boolean } = {}) {
  const { lobby, playerId } = getAdminContext(socket, context);
  assertAdmin(playerId, lobby);
  if (lobby.players.length < 2) throw new Error("En az 2 oyuncu gerekli");
  if (lobby.tournamentId) throw new Error("Turnuva zaten hazırlandı");

  if (!options.skipReady) {
    const notReady = lobby.players.filter((player) => !player.isTest && !player.isReady);
    if (notReady.length > 0) {
      throw new Error(`Hazır olmayan oyuncular: ${notReady.map((player) => player.name).join(", ")}`);
    }
  }

  const bracketSize = getBracketSize(lobby.players.length);
  const phases = buildTournamentPhases(bracketSize);
  const tournament: Tournament = {
    id: createId("tournament"),
    lobbyId: lobby.id,
    status: "seeded",
    adminPlayerId: lobby.adminPlayerId,
    currentPhaseIndex: 0,
    currentPhaseKey: phases[0].phaseKey,
    phases,
    champion: null,
    roundAdvanceMode: Boolean(lobby.settings?.autoAdvance) ? "automatic" : "hybrid",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const firstPhase = tournament.phases[0];
  const matches = createInitialPhaseMatches(lobby.players, firstPhase, tournament.id);
  firstPhase.matchIds = matches.map((match) => match.id);
  firstPhase.winners = collectPhaseWinners(matches);

  context.store.tournaments.set(tournament.id, tournament);
  matches.forEach((match) => context.store.matches.set(match.id, match));
  lobby.tournamentId = tournament.id;

  context.store.addAdminAction(
    createAdminAction(tournament, lobby.adminPlayerId, "TOURNAMENT_SEEDED", {
      bracketSize,
      playerCount: lobby.players.length
    })
  );

  emitFeed(context, phaseWaitingEvent(lobby.id, firstPhase));
  matches.filter((match) => match.isBye).forEach((match) => emitFeed(context, byeAdvanceEvent(lobby.id, match)));
  emitSnapshot(context, lobby.id);
}

function startTournament(socket: AppSocket, context: SocketContext) {
  const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
  assertAdmin(playerId, lobby);
  if (tournament.status !== "seeded") throw new Error("Önce bracket hazırlanmalı");

  tournament.status = "active";
  tournament.updatedAt = nowIso();
  lobby.status = "active";
  context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "TOURNAMENT_STARTED"));
  emitSnapshot(context, lobby.id);
}

function startCurrentPhase(socket: AppSocket, context: SocketContext) {
  const { lobby, tournament, playerId } = getAdminTournamentContext(socket, context);
  assertAdmin(playerId, lobby);
  startPhasePlay(context, lobby.id, tournament, timeoutForLobby(context, lobby.id, processMove));
  emitSnapshot(context, lobby.id);
}

function getAdminContext(socket: AppSocket, context: SocketContext) {
  const session = context.store.getSession(socket.id);
  if (!session.lobbyId) throw new Error("Aktif lobi oturumu yok");
  const lobby = context.store.lobbies.get(session.lobbyId);
  if (!lobby) throw new Error("Lobi bulunamadı");
  return {
    session,
    lobby,
    playerId: session.playerId
  };
}

function getAdminTournamentContext(socket: AppSocket, context: SocketContext) {
  const adminContext = getAdminContext(socket, context);
  const tournamentId = adminContext.lobby.tournamentId;
  if (!tournamentId) throw new Error("Turnuva henüz hazırlanmadı");
  const tournament = context.store.tournaments.get(tournamentId);
  if (!tournament) throw new Error("Turnuva bulunamadı");
  return {
    ...adminContext,
    tournament
  };
}

function applyRoomUpdate(
  socket: AppSocket,
  context: SocketContext,
  patch: {
    name?: string;
    overlayEnabled?: boolean;
    winningScore?: number;
    moveSeconds?: number;
    countdownSeconds?: number;
    autoAdvance?: boolean;
  }
) {
  const { lobby, playerId } = getAdminContext(socket, context);
  assertAdmin(playerId, lobby);
  context.store.updateRoom(lobby.id, patch);

  if (lobby.tournamentId) {
    const tournament = context.store.tournaments.get(lobby.tournamentId);
    if (tournament) {
      context.store.addAdminAction(createAdminAction(tournament, lobby.adminPlayerId, "ROOM_UPDATED", patch));
    }
  }

  emitSnapshot(context, lobby.id);
}
