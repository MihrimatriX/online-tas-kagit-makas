import { createAdminAction } from "./admin.service.js";
import {
  createNextPhaseMatches,
  nowIso
} from "./bracket.service.js";
import { startMatch } from "./match.service.js";
import {
  activateNextPhase,
  canAdvancePhase,
  canStartPhase,
  collectPhaseWinners,
  completePhaseIfReady,
  getCurrentPhase,
  getNextPhase,
  getPhaseMatches
} from "./phase.service.js";
import {
  byeAdvanceEvent,
  createFeedEvent,
  matchFinishedEvent,
  phaseAdvancedEvent,
  phaseCompletedEvent,
  phaseStartedEvent,
  phaseWaitingEvent
} from "./live-feed.service.js";
import { clockFromLobby, Match, Move, PlayerRef, Tournament, TournamentPhase } from "./tournament.types.js";
import { startMatchClock, startMoveTimer } from "./timer.service.js";
import {
  emitFeed,
  emitSnapshot,
  matchRoom,
  SocketContext
} from "../socket/socket.types.js";

export type MoveTimeout = (match: Match, playerId: string, move: Move) => void;
export type ProcessMoveFn = (
  context: SocketContext,
  lobbyId: string,
  matchId: string,
  playerId: string,
  move: Move
) => void;

export function timeoutForLobby(context: SocketContext, lobbyId: string, process: ProcessMoveFn): MoveTimeout {
  return (timedMatch, timedPlayerId, autoMove) => {
    try {
      process(context, lobbyId, timedMatch.id, timedPlayerId, autoMove);
    } catch {
      // match may have ended between timer start and fire
    }
  };
}

export function startPlayableMatch(
  context: SocketContext,
  match: Match,
  onTimeout: MoveTimeout,
  options: { skipCountdown?: boolean } = {}
) {
  startMatch(match);
  joinMatchRoom(context, match);
  notifyPlayersAboutMatch(context, match);
  const publishClock = () => {
    const tournament = context.store.tournaments.get(match.tournamentId);
    if (tournament) emitSnapshot(context, tournament.lobbyId);
  };
  const clock = matchClock(context, match);
  if (options.skipCountdown || clock.countdownMs === 0) {
    startMoveTimer(match, onTimeout, clock.moveMs);
    publishClock();
  } else {
    startMatchClock(match, onTimeout, publishClock, {
      countdownMs: clock.countdownMs,
      moveMs: clock.moveMs
    });
  }
}

export function joinMatchRoom(context: SocketContext, match: Match) {
  [match.player1, match.player2]
    .filter((player) => !player.isBye)
    .forEach((player) => {
      const socket = socketForPlayer(context, match, player.id);
      socket?.join(matchRoom(match.id));
    });
}

export function joinPlayerToActiveMatches(
  context: SocketContext,
  lobbyId: string,
  playerId: string,
  socketId: string
) {
  const lobby = context.store.lobbies.get(lobbyId);
  if (!lobby?.tournamentId) return;

  const socket = context.io.sockets.sockets.get(socketId);
  if (!socket) return;

  for (const match of context.store.matches.values()) {
    if (match.tournamentId !== lobby.tournamentId) continue;
    if (match.status !== "playing" && match.status !== "paused") continue;
    if (match.player1.id !== playerId && match.player2.id !== playerId) continue;
    socket.join(matchRoom(match.id));
  }
}

export function notifyPlayersAboutMatch(context: SocketContext, match: Match) {
  const players: PlayerRef[] = [match.player1, match.player2];
  players
    .filter((player) => !player.isBye)
    .forEach((player) => {
      const socket = socketForPlayer(context, match, player.id);
      if (!socket) return;
      const opponent = players.find((candidate) => candidate.id !== player.id);
      socket.emit("match:assigned", {
        matchId: match.id,
        opponent,
        phaseName: match.phaseName
      });
    });
}

export function broadcastMatchFinished(context: SocketContext, lobbyId: string, match: Match) {
  markEliminated(context, lobbyId, match.loser);
  context.io.to(matchRoom(match.id)).emit("match:finished", {
    matchId: match.id,
    winner: match.winner,
    loser: match.loser
  });
  emitFeed(context, matchFinishedEvent(lobbyId, match));
}

export function markEliminated(context: SocketContext, lobbyId: string, loser: PlayerRef | null) {
  if (!loser || loser.isBye) return;
  const lobby = context.store.lobbies.get(lobbyId);
  const player = lobby?.players.find((candidate) => candidate.id === loser.id);
  if (player) player.isEliminated = true;
}

export function clearMatchElimination(context: SocketContext, lobbyId: string, match: Match) {
  const lobby = context.store.lobbies.get(lobbyId);
  if (!lobby) return;
  for (const ref of [match.player1, match.player2]) {
    if (ref.isBye) continue;
    const player = lobby.players.find((candidate) => candidate.id === ref.id);
    if (player) player.isEliminated = false;
  }
}

export function maybeCompletePhase(
  context: SocketContext,
  lobbyId: string,
  tournament: Tournament,
  phase = getCurrentPhase(tournament)
) {
  const matches = getPhaseMatches(phase, context.store.matches);
  const completed = completePhaseIfReady(phase, matches);
  if (!completed) return false;

  context.store.addAdminAction(
    createAdminAction(tournament, tournament.adminPlayerId, "PHASE_COMPLETED", {
      phaseId: phase.id
    })
  );
  emitFeed(context, phaseCompletedEvent(lobbyId, phase));
  return true;
}

export function maybeCompleteAndAdvance(
  context: SocketContext,
  lobbyId: string,
  tournament: Tournament,
  phase: TournamentPhase,
  onTimeout: MoveTimeout
) {
  if (!maybeCompletePhase(context, lobbyId, tournament, phase)) return;
  if (tournament.roundAdvanceMode !== "automatic") return;
  advancePhase(context, lobbyId, tournament);
  const next = getCurrentPhase(tournament);
  if (next.phaseKey === "champion") return;
  startPhasePlay(context, lobbyId, tournament, onTimeout);
}

export function advancePhase(context: SocketContext, lobbyId: string, tournament: Tournament) {
  const currentPhase = getCurrentPhase(tournament);
  const currentMatches = getPhaseMatches(currentPhase, context.store.matches);
  if (!canAdvancePhase(tournament, currentPhase, currentMatches)) {
    throw new Error("Mevcut aşama ilerlemeye hazır değil");
  }

  const nextPhase = getNextPhase(tournament);
  if (!nextPhase) throw new Error("Sonraki aşama yok");

  const winners = currentPhase.winners.length ? currentPhase.winners : collectPhaseWinners(currentMatches);
  currentPhase.winners = winners;

  if (nextPhase.phaseKey === "champion") {
    const champion = winners[0];
    if (!champion) throw new Error("Şampiyon çözülemedi");
    tournament.champion = champion;
    activateNextPhase(tournament, nextPhase);
    nextPhase.winners = [champion];
    emitFeed(
      context,
      createFeedEvent(lobbyId, "phase_advanced", "Şampiyon ekranı yayın için hazır.", {
        phaseId: nextPhase.id
      })
    );
  } else {
    const matches = createNextPhaseMatches(winners, nextPhase, tournament.id);
    nextPhase.matchIds = matches.map((match) => match.id);
    nextPhase.winners = collectPhaseWinners(matches);
    matches.forEach((match) => context.store.matches.set(match.id, match));
    activateNextPhase(tournament, nextPhase);
    emitFeed(context, phaseAdvancedEvent(lobbyId, nextPhase));
    emitFeed(context, phaseWaitingEvent(lobbyId, nextPhase));
    matches
      .filter((match) => match.isBye)
      .forEach((match) => emitFeed(context, byeAdvanceEvent(lobbyId, match)));
  }

  context.store.addAdminAction(
    createAdminAction(tournament, tournament.adminPlayerId, "PHASE_ADVANCED", {
      fromPhaseId: currentPhase.id,
      toPhaseId: nextPhase.id
    })
  );
}

export function startPhasePlay(
  context: SocketContext,
  lobbyId: string,
  tournament: Tournament,
  onTimeout: MoveTimeout
) {
  const phase = getCurrentPhase(tournament);
  if (!canStartPhase(tournament, phase)) throw new Error("Mevcut aşama başlatılamaz");

  phase.status = "active";
  phase.startedAt = nowIso();
  phase.startedBy = tournament.adminPlayerId;

  const matches = getPhaseMatches(phase, context.store.matches);
  const playableMatches = matches.filter((match) => match.status === "waiting" && !match.isBye);
  playableMatches.forEach((match) => startPlayableMatch(context, match, onTimeout));

  context.store.addAdminAction(
    createAdminAction(tournament, tournament.adminPlayerId, "PHASE_STARTED", {
      phaseId: phase.id
    })
  );
  emitFeed(context, phaseStartedEvent(lobbyId, phase, playableMatches.length));
  maybeCompleteAndAdvance(context, lobbyId, tournament, phase, onTimeout);
}

export function restorePlayingMatchClocks(context: SocketContext, process: ProcessMoveFn) {
  for (const match of context.store.matches.values()) {
    if (match.status !== "playing") continue;
    const tournament = context.store.tournaments.get(match.tournamentId);
    if (!tournament) continue;
    match.countdownEndsAt = null;
    startMoveTimer(match, timeoutForLobby(context, tournament.lobbyId, process), matchClock(context, match).moveMs);
  }
}

export function transferAdminIfOffline(context: SocketContext, lobbyId: string) {
  const next = context.store.promoteAdmin(lobbyId);
  if (!next) return null;
  const lobby = context.store.lobbies.get(lobbyId);
  emitFeed(
    context,
    createFeedEvent(lobbyId, "admin_action", `Admin düştü, kontrol ${next.name} oyuncusuna geçti.`)
  );
  if (lobby?.tournamentId) {
    const tournament = context.store.tournaments.get(lobby.tournamentId);
    if (tournament) {
      context.store.addAdminAction(
        createAdminAction(tournament, next.id, "ADMIN_TRANSFERRED", { playerId: next.id })
      );
    }
  }
  emitSnapshot(context, lobbyId);
  return next;
}

function socketForPlayer(context: SocketContext, match: Match, playerId: string) {
  const lobby = context.store.lobbies.get(context.store.tournaments.get(match.tournamentId)?.lobbyId ?? "");
  const socketId = lobby?.players.find((candidate) => candidate.id === playerId)?.socketId;
  return socketId ? context.io.sockets.sockets.get(socketId) : undefined;
}

function matchClock(context: SocketContext, match: Match) {
  const tournament = context.store.tournaments.get(match.tournamentId);
  const lobby = tournament ? context.store.lobbies.get(tournament.lobbyId) : undefined;
  return clockFromLobby(lobby);
}
