import { z } from "zod";
import { assertAdmin, createAdminAction } from "../tournament/admin.service.js";
import { createFeedEvent } from "../tournament/live-feed.service.js";
import { nowIso } from "../tournament/bracket.service.js";
import { getPhaseMatches } from "../tournament/phase.service.js";
import { pauseMatchTimers, resumeMatchTimers } from "../tournament/timer.service.js";
import { clockFromLobby } from "../tournament/tournament.types.js";
import { processMove } from "./match.events.js";
import { AppSocket, emitError, emitFeed, emitSnapshot, SocketContext } from "./socket.types.js";

const phaseSchema = z.object({
  phaseId: z.string()
});

export function registerPhaseEvents(socket: AppSocket, context: SocketContext) {
  socket.on("admin:phasePause", (payload) => {
    try {
      const { phaseId } = phaseSchema.parse(payload);
      const { lobby, tournament, playerId } = getContext(socket, context);
      assertAdmin(playerId, lobby);

      const phase = tournament.phases.find((candidate) => candidate.id === phaseId);
      if (!phase || phase.status !== "active") throw new Error("Aşama duraklatılamaz");

      const matches = getPhaseMatches(phase, context.store.matches);
      pauseMatchTimers(matches);

      phase.status = "waiting";
      tournament.status = "paused";
      tournament.updatedAt = nowIso();
      context.store.addAdminAction(
        createAdminAction(tournament, lobby.adminPlayerId, "PHASE_PAUSED", { phaseId })
      );
      emitFeed(context, createFeedEvent(lobby.id, "phase_paused", `${phase.name} duraklatıldı.`, { phaseId }));
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("admin:phaseResume", (payload) => {
    try {
      const { phaseId } = phaseSchema.parse(payload);
      const { lobby, tournament, playerId } = getContext(socket, context);
      assertAdmin(playerId, lobby);

      const phase = tournament.phases.find((candidate) => candidate.id === phaseId);
      if (!phase || phase.status !== "waiting" || tournament.status !== "paused") {
        throw new Error("Aşama sürdürülemez");
      }

      phase.status = "active";
      tournament.status = "active";
      tournament.updatedAt = nowIso();

      const matches = getPhaseMatches(phase, context.store.matches);
      resumeMatchTimers(
        matches,
        (timedMatch, timedPlayerId, autoMove) => {
          try {
            processMove(context, lobby.id, timedMatch.id, timedPlayerId, autoMove);
          } catch {
            // match may have ended
          }
        },
        clockFromLobby(lobby).moveMs
      );

      context.store.addAdminAction(
        createAdminAction(tournament, lobby.adminPlayerId, "PHASE_RESUMED", { phaseId })
      );
      emitFeed(context, createFeedEvent(lobby.id, "phase_resumed", `${phase.name} devam ediyor.`, { phaseId }));
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });
}

function getContext(socket: AppSocket, context: SocketContext) {
  const session = context.store.getSession(socket.id);
  if (!session.lobbyId || !session.playerId) throw new Error("Aktif lobi oturumu yok");
  const lobby = context.store.lobbies.get(session.lobbyId);
  if (!lobby?.tournamentId) throw new Error("Turnuva henüz hazırlanmadı");
  const tournament = context.store.tournaments.get(lobby.tournamentId);
  if (!tournament) throw new Error("Turnuva bulunamadı");

  return {
    lobby,
    tournament,
    playerId: session.playerId
  };
}
