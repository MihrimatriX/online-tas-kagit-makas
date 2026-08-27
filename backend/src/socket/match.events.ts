import { z } from "zod";
import { registerMove, isValidMove } from "../tournament/match.service.js";
import { roundResultEvent } from "../tournament/live-feed.service.js";
import { clockFromLobby, Move } from "../tournament/tournament.types.js";
import { clearMatchClock, ensureMoveTimer, startMoveTimer } from "../tournament/timer.service.js";
import {
  broadcastMatchFinished,
  maybeCompleteAndAdvance,
  timeoutForLobby
} from "../tournament/flow.service.js";
import {
  AppSocket,
  emitError,
  emitFeed,
  emitSnapshot,
  matchRoom,
  SocketContext
} from "./socket.types.js";

const moveSchema = z.object({
  matchId: z.string(),
  move: z.unknown().refine(isValidMove, "Geçersiz hamle")
});

export function registerMatchEvents(socket: AppSocket, context: SocketContext) {
  socket.on("match:move", (payload) => {
    try {
      const { matchId, move } = moveSchema.parse(payload);
      const session = context.store.getSession(socket.id);
      if (!session.lobbyId || !session.playerId) throw new Error("Aktif oyuncu oturumu yok");

      processMove(context, session.lobbyId, matchId, session.playerId, move);
      socket.emit("match:moveAccepted", {
        matchId,
        move
      });
    } catch (error) {
      emitError(socket, error);
    }
  });
}

export function processMove(
  context: SocketContext,
  lobbyId: string,
  matchId: string,
  playerId: string,
  move: Move
) {
  const lobby = context.store.lobbies.get(lobbyId);
  const match = context.store.matches.get(matchId);
  if (!lobby || !match) throw new Error("Maç bulunamadı");

  const onTimeout = timeoutForLobby(context, lobbyId, processMove);
  const clock = clockFromLobby(lobby);
  const resolution = registerMove(match, playerId, move, clock.winningScore);

  if (resolution.round) {
    clearMatchClock(match.id, match);

    context.io.to(matchRoom(match.id)).emit("match:roundResult", {
      matchId: match.id,
      round: resolution.round,
      scores: {
        [match.player1.id]: match.player1.score,
        [match.player2.id]: match.player2.score
      }
    });

    emitFeed(context, roundResultEvent(lobby.id, match, resolution.round));
    context.io.to(`lobby:${lobby.id}`).emit("live:roundResult", {
      matchId: match.id,
      p1Name: match.player1.name,
      p2Name: match.player2.name,
      p1Move: resolution.round.p1Move,
      p2Move: resolution.round.p2Move,
      p1Score: match.player1.score,
      p2Score: match.player2.score,
      roundWinner: resolution.round.winner
    });

    if (!resolution.isMatchComplete && match.status === "playing") {
      startMoveTimer(match, onTimeout, clock.moveMs);
    }
  } else {
    ensureMoveTimer(match, onTimeout, clock.moveMs);
  }

  if (resolution.isMatchComplete) {
    clearMatchClock(match.id, match);
    broadcastMatchFinished(context, lobby.id, match);

    const tournament = context.store.tournaments.get(match.tournamentId);
    const phase = tournament?.phases.find((candidate) => candidate.id === match.phaseId);
    if (tournament && phase) {
      maybeCompleteAndAdvance(context, lobby.id, tournament, phase, onTimeout);
    }
  }

  emitSnapshot(context, lobby.id);
}
