import { createAdminAction } from "./admin.service.js";
import {
  buildTournamentPhases,
  createId,
  createInitialPhaseMatches,
  createNextPhaseMatches,
  getBracketSize,
  nowIso
} from "./bracket.service.js";
import {
  byeAdvanceEvent,
  createFeedEvent,
  matchFinishedText,
  phaseAdvancedEvent,
  phaseCompletedEvent,
  phaseStartedEvent,
  phaseWaitingEvent,
  roundResultEvent,
  tournamentWinnerEvent
} from "./live-feed.service.js";
import {
  assignWinner,
  isMatchDone,
  opponentOf,
  registerMove,
  resetMatch,
  startMatch,
  timeoutAction
} from "./match.service.js";
import {
  activatePhase,
  collectPhaseWinners,
  completePhaseIfReady,
  getCurrentPhase,
  getNextPhase,
  getPhaseMatches
} from "./phase.service.js";
import { cancel, clearMatchClock, schedule, startRoundClock } from "./timer.service.js";
import { AdminActionType, Lobby, Match, Move, MOVES, PlayerRef, Tournament, TournamentPhase } from "./tournament.types.js";
import { emitFeed, emitSnapshot, lobbyRoom, SocketContext, socketOf } from "../socket/socket.types.js";

/** How long both players see the previous round before the next move window opens. */
const REVEAL_MS = 2_500;
/** Nobody watches a bot-vs-bot reveal; keep test tournaments quick. */
const BOT_REVEAL_MS = 400;
/** Breather between a finished round of matches and the next one when auto-advance is on. */
const INTERMISSION_MS = 4_000;

type ForfeitReason = "timeout" | "left" | "kicked";

const FORFEIT_TEXT: Record<ForfeitReason, (loser: string, winner: string) => string> = {
  timeout: (loser, winner) => `${loser} hamle yapmadı, ${winner} hükmen kazandı.`,
  left: (loser, winner) => `${loser} turnuvadan çekildi, ${winner} hükmen kazandı.`,
  kicked: (loser, winner) => `${loser} admin tarafından çıkarıldı, ${winner} hükmen kazandı.`
};

// ─── moves & round clock ──────────────────────────────────────────────

export function processMove(context: SocketContext, matchId: string, playerId: string, move: Move, auto = false) {
  const match = context.store.matches.get(matchId);
  if (!match) throw new Error("Maç bulunamadı");
  const { lobby, tournament } = ownersOf(context, match);
  if (tournament.status !== "active") throw new Error("Turnuva şu an duraklatılmış");

  const resolution = registerMove(match, playerId, move, lobby.settings.winningScore);
  if (!auto) match.missedMoves[playerId] = 0;

  if (resolution.round) {
    clearMatchClock(match);
    // Play-by-play only for the big matches; a 32-match round would drown the feed.
    if (phaseOf(tournament, match).matchIds.length <= 2) {
      emitFeed(context, roundResultEvent(lobby.id, match, resolution.round));
    }
    if (resolution.isMatchComplete) {
      onMatchFinished(context, lobby, tournament, match, matchFinishedText(match));
    } else {
      armRound(context, lobby, match, botsOnly(match) ? BOT_REVEAL_MS : REVEAL_MS);
    }
  }
  emitSnapshot(context, lobby.id);
}

function armRound(context: SocketContext, lobby: Lobby, match: Match, countdownMs: number) {
  startRoundClock(match, {
    countdownMs,
    moveMs: lobby.settings.moveSeconds * 1000,
    onOpen: () => {
      scheduleBotMoves(context, match);
      if (countdownMs > 0) emitSnapshot(context, lobby.id);
    },
    onTimeout: (missing) => handleTimeout(context, match, missing)
  });
}

function scheduleBotMoves(context: SocketContext, match: Match) {
  for (const player of [match.player1, match.player2]) {
    if (!player.isTest || match.pendingMoves[player.id]) continue;
    schedule(`bot:${match.id}:${player.id}`, 500 + Math.random() * 1000, () => autoMove(context, match.id, player.id));
  }
}

function autoMove(context: SocketContext, matchId: string, playerId: string) {
  try {
    processMove(context, matchId, playerId, MOVES[Math.floor(Math.random() * MOVES.length)], true);
  } catch {
    // The match moved on (finished, paused, reset) between scheduling and firing.
  }
}

function handleTimeout(context: SocketContext, match: Match, missing: string[]) {
  const { lobby } = ownersOf(context, match);
  const forfeiting = missing.filter((playerId) => {
    const missed = (match.missedMoves[playerId] ?? 0) + 1;
    match.missedMoves[playerId] = missed;
    return timeoutAction(missed, isOnline(lobby, playerId)) === "forfeit_match";
  });

  // A match needs a winner: if both sides would forfeit, keep it alive with random moves instead.
  if (forfeiting.length === 1) {
    forfeitMatch(context, match, forfeiting[0], "timeout");
    emitSnapshot(context, lobby.id);
    return;
  }
  for (const playerId of missing) autoMove(context, match.id, playerId);
}

function forfeitMatch(context: SocketContext, match: Match, loserId: string, reason: ForfeitReason) {
  const { lobby, tournament } = ownersOf(context, match);
  clearMatchClock(match);
  const loser = match.player1.id === loserId ? match.player1 : match.player2;
  const winner = opponentOf(match, loserId);
  assignWinner(match, winner.id, "walkover");
  onMatchFinished(context, lobby, tournament, match, FORFEIT_TEXT[reason](loser.name, winner.name));
}

function onMatchFinished(context: SocketContext, lobby: Lobby, tournament: Tournament, match: Match, feedText: string) {
  setEliminated(lobby, match.loser, true);
  for (const player of [match.player1, match.player2]) {
    socketOf(context, lobby, player.id)?.emit("match:finished", { matchId: match.id, winnerId: match.winner?.id });
  }
  emitFeed(context, createFeedEvent(lobby.id, "match_finished", feedText, { matchId: match.id, phaseId: match.phaseId }));
  tryCompletePhase(context, lobby, tournament, phaseOf(tournament, match));
}

function startPlayableMatch(context: SocketContext, lobby: Lobby, match: Match) {
  startMatch(match);
  for (const player of [match.player1, match.player2]) {
    socketOf(context, lobby, player.id)?.emit("match:assigned", {
      matchId: match.id,
      opponent: opponentOf(match, player.id).name,
      phaseName: match.phaseName
    });
  }
  armRound(context, lobby, match, botsOnly(match) ? 0 : lobby.settings.countdownSeconds * 1000);
}

// ─── phases ───────────────────────────────────────────────────────────

function tryCompletePhase(context: SocketContext, lobby: Lobby, tournament: Tournament, phase: TournamentPhase) {
  // While paused, completion waits for resume — which calls back in here.
  if (tournament.status !== "active") return;
  if (!completePhaseIfReady(phase, getPhaseMatches(phase, context.store.matches))) return;

  log(context, tournament, "PHASE_COMPLETED", { phaseId: phase.id });
  emitFeed(context, phaseCompletedEvent(lobby.id, phase));
  if (lobby.settings.autoAdvance) scheduleAutoAdvance(context, lobby.id, tournament.id);
}

export function scheduleAutoAdvance(context: SocketContext, lobbyId: string, tournamentId: string) {
  schedule(`advance:${tournamentId}`, INTERMISSION_MS, () => {
    const lobby = context.store.lobbies.get(lobbyId);
    const tournament = context.store.tournaments.get(tournamentId);
    // Re-check everything: the admin may have paused, restarted a match or switched auto-advance off.
    if (!lobby?.settings.autoAdvance || tournament?.status !== "active") return;
    if (getCurrentPhase(tournament).status !== "completed") return;
    advanceTournament(context, lobby, tournament);
    emitSnapshot(context, lobbyId);
  });
}

function startPhasePlay(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  const phase = getCurrentPhase(tournament);
  if (tournament.status !== "active" || phase.status !== "waiting" || phase.matchIds.length === 0) {
    throw new Error("Bu aşama başlatılamaz");
  }
  phase.status = "active";
  phase.startedAt = nowIso();

  const playable = getPhaseMatches(phase, context.store.matches).filter((match) => match.status === "waiting");
  for (const match of playable) {
    // A winner who left or was kicked after their last match must not hold up the next one.
    const gone = [match.player1, match.player2].find((player) => hasLeft(lobby, player.id));
    if (gone) forfeitMatch(context, match, gone.id, "left");
    else startPlayableMatch(context, lobby, match);
  }
  emitFeed(context, phaseStartedEvent(lobby.id, phase, playable.length));
  // Every match may already be decided (BYEs, admin-assigned while seeded).
  tryCompletePhase(context, lobby, tournament, phase);
}

/** Moves a completed phase forward: next round's pairings start immediately, or the final crowns a champion. */
export function advanceTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  const current = getCurrentPhase(tournament);
  if (tournament.status !== "active" || current.status !== "completed") throw new Error("Bu tur henüz bitmedi");
  const next = getNextPhase(tournament);
  if (!next) throw new Error("Sonraki aşama yok");
  cancel(`advance:${tournament.id}`);

  // Always recollect: an admin may have changed a result after the phase completed.
  const winners = collectPhaseWinners(getPhaseMatches(current, context.store.matches));
  current.winners = winners;

  if (next.phaseKey === "champion") {
    crownChampion(context, lobby, tournament, next, winners[0]);
    return;
  }

  const matches = createNextPhaseMatches(winners, next, tournament.id);
  next.matchIds = matches.map((match) => match.id);
  matches.forEach((match) => context.store.matches.set(match.id, match));
  activatePhase(tournament, next);
  log(context, tournament, "PHASE_ADVANCED", { fromPhaseId: current.id, toPhaseId: next.id });
  emitFeed(context, phaseAdvancedEvent(lobby.id, next));
  startPhasePlay(context, lobby, tournament);
}

function crownChampion(
  context: SocketContext,
  lobby: Lobby,
  tournament: Tournament,
  championPhase: TournamentPhase,
  champion: PlayerRef | undefined
) {
  if (!champion) throw new Error("Şampiyon belirlenemedi");
  activatePhase(tournament, championPhase);
  championPhase.status = "completed";
  championPhase.completedAt = nowIso();
  championPhase.winners = [champion];
  tournament.champion = champion;
  tournament.status = "finished";
  lobby.status = "finished";

  log(context, tournament, "CHAMPION_CROWNED", { playerId: champion.id });
  emitFeed(context, tournamentWinnerEvent(lobby.id, champion));
  context.io.to(lobbyRoom(lobby.id)).emit("tournament:winner", { champion });
}

// ─── admin commands ──────────────────────────────────────────────────

export function seedTournament(context: SocketContext, lobby: Lobby, options: { ignoreReady?: boolean } = {}) {
  if (lobby.tournamentId) throw new Error("Eşleşmeler zaten çekildi");
  if (lobby.players.length < 2) throw new Error("En az 2 oyuncu gerekli");
  if (!options.ignoreReady) {
    const notReady = lobby.players.filter((player) => !player.isTest && !player.isReady);
    if (notReady.length) throw new Error(`Hazır olmayanlar: ${notReady.map((player) => player.name).join(", ")}`);
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
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const firstPhase = phases[0];
  const matches = createInitialPhaseMatches(lobby.players, firstPhase, tournament.id);
  firstPhase.matchIds = matches.map((match) => match.id);
  context.store.tournaments.set(tournament.id, tournament);
  matches.forEach((match) => context.store.matches.set(match.id, match));
  lobby.tournamentId = tournament.id;

  log(context, tournament, "TOURNAMENT_SEEDED", { bracketSize, playerCount: lobby.players.length });
  emitFeed(context, phaseWaitingEvent(lobby.id, firstPhase));
  matches.filter((match) => match.isBye).forEach((match) => emitFeed(context, byeAdvanceEvent(lobby.id, match)));
  return tournament;
}

/** Throws the pairings away so the lobby can take new players or reshuffle. */
export function unseedTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  if (tournament.status !== "seeded") throw new Error("Turnuva başladıktan sonra eşleşmeler bozulamaz");
  context.store.deleteTournament(tournament.id);
  // Players kicked or gone while seeded were only marked eliminated; drop them now.
  lobby.players = lobby.players.filter((player) => !player.isEliminated);
  emitFeed(context, createFeedEvent(lobby.id, "admin_action", "Eşleşmeler bozuldu, lobi yeniden açık."));
}

export function startTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  if (tournament.status !== "seeded") throw new Error("Önce eşleşmeleri çek");
  tournament.status = "active";
  tournament.updatedAt = nowIso();
  lobby.status = "active";
  log(context, tournament, "TOURNAMENT_STARTED");
  startPhasePlay(context, lobby, tournament);
}

export function pauseTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  const phase = getCurrentPhase(tournament);
  if (tournament.status !== "active" || phase.status !== "active") throw new Error("Duraklatılacak aktif tur yok");
  for (const match of getPhaseMatches(phase, context.store.matches)) {
    if (match.status !== "playing") continue;
    clearMatchClock(match);
    match.status = "paused";
  }
  tournament.status = "paused";
  tournament.updatedAt = nowIso();
  log(context, tournament, "PHASE_PAUSED", { phaseId: phase.id });
  emitFeed(context, createFeedEvent(lobby.id, "phase_paused", `${phase.name} duraklatıldı.`, { phaseId: phase.id }));
}

export function resumeTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  if (tournament.status !== "paused") throw new Error("Turnuva duraklatılmamış");
  const phase = getCurrentPhase(tournament);
  tournament.status = "active";
  tournament.updatedAt = nowIso();

  for (const match of getPhaseMatches(phase, context.store.matches)) {
    if (match.status === "paused") {
      match.status = "playing";
      armRound(context, lobby, match, 0);
    } else if (match.status === "waiting") {
      // Restarted by the admin during the pause.
      startPlayableMatch(context, lobby, match);
    }
  }
  log(context, tournament, "PHASE_RESUMED", { phaseId: phase.id });
  emitFeed(context, createFeedEvent(lobby.id, "phase_resumed", `${phase.name} devam ediyor.`, { phaseId: phase.id }));
  // Results assigned during the pause may have finished the phase.
  tryCompletePhase(context, lobby, tournament, phase);
}

export function assignMatchWinner(
  context: SocketContext,
  lobby: Lobby,
  tournament: Tournament,
  matchId: string,
  winnerId: string
) {
  const match = currentPhaseMatch(context, tournament, matchId);
  const winner = [match.player1, match.player2].find((player) => player.id === winnerId);
  if (!winner) throw new Error("Kazanan bu maçın oyuncusu değil");

  clearMatchClock(match);
  setEliminated(lobby, match.player1, false);
  setEliminated(lobby, match.player2, false);
  assignWinner(match, winnerId, "finished");
  log(context, tournament, "MATCH_WINNER_ASSIGNED", { matchId, winnerId });

  const phase = phaseOf(tournament, match);
  if (phase.status === "completed") phase.winners = collectPhaseWinners(getPhaseMatches(phase, context.store.matches));
  onMatchFinished(context, lobby, tournament, match, `Admin kararı: ${winner.name} kazandı · ${match.phaseName}`);
}

export function restartMatch(context: SocketContext, lobby: Lobby, tournament: Tournament, matchId: string) {
  const match = currentPhaseMatch(context, tournament, matchId);
  const phase = phaseOf(tournament, match);

  clearMatchClock(match);
  setEliminated(lobby, match.player1, false);
  setEliminated(lobby, match.player2, false);
  resetMatch(match);

  if (phase.status === "completed") {
    cancel(`advance:${tournament.id}`);
    phase.status = "active";
    phase.completedAt = null;
    phase.winners = [];
  }
  if (tournament.status === "active" && phase.status === "active") startPlayableMatch(context, lobby, match);

  log(context, tournament, "MATCH_RESTARTED", { matchId });
  emitFeed(
    context,
    createFeedEvent(lobby.id, "admin_action", `${match.player1.name} – ${match.player2.name} maçı baştan oynanacak.`, {
      matchId,
      phaseId: match.phaseId
    })
  );
}

/** A player leaves or is kicked mid-tournament: their open match goes to the opponent. */
export function forfeitPlayer(context: SocketContext, lobby: Lobby, playerId: string, reason: "left" | "kicked") {
  const tournament = lobby.tournamentId ? context.store.tournaments.get(lobby.tournamentId) : undefined;
  if (!tournament || tournament.status === "finished") return;
  const match = getPhaseMatches(getCurrentPhase(tournament), context.store.matches).find(
    (candidate) => !isMatchDone(candidate) && (candidate.player1.id === playerId || candidate.player2.id === playerId)
  );
  if (match) forfeitMatch(context, match, playerId, reason);
}

/** After a finished tournament: same room, same code, fresh bracket. */
export function resetForNewTournament(context: SocketContext, lobby: Lobby, tournament: Tournament) {
  if (tournament.status !== "finished") throw new Error("Turnuva henüz bitmedi");
  context.store.deleteTournament(tournament.id);
  lobby.status = "waiting";
  lobby.players = lobby.players.filter((player) => player.isTest || player.connectionStatus === "online");
  for (const player of lobby.players) {
    player.isEliminated = false;
    player.isReady = Boolean(player.isTest);
  }
  emitFeed(context, createFeedEvent(lobby.id, "admin_action", "Yeni turnuva için lobi açıldı."));
}

// ─── restart recovery ─────────────────────────────────────────────────

/** Re-arms in-flight clocks after a server restart (persisted state carries no timers). */
export function restoreTournamentClocks(context: SocketContext) {
  for (const tournament of context.store.tournaments.values()) {
    const lobby = context.store.lobbies.get(tournament.lobbyId);
    if (!lobby || tournament.status !== "active") continue;
    const phase = getCurrentPhase(tournament);
    for (const match of getPhaseMatches(phase, context.store.matches)) {
      if (match.status === "playing") armRound(context, lobby, match, lobby.settings.countdownSeconds * 1000);
    }
    if (phase.status === "active") tryCompletePhase(context, lobby, tournament, phase);
    else if (phase.status === "completed" && lobby.settings.autoAdvance) scheduleAutoAdvance(context, lobby.id, tournament.id);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function ownersOf(context: SocketContext, match: Match) {
  const tournament = context.store.tournaments.get(match.tournamentId);
  const lobby = tournament ? context.store.lobbies.get(tournament.lobbyId) : undefined;
  if (!tournament || !lobby) throw new Error("Maçın turnuvası bulunamadı");
  return { lobby, tournament };
}

function phaseOf(tournament: Tournament, match: Match) {
  const phase = tournament.phases.find((candidate) => candidate.id === match.phaseId);
  if (!phase) throw new Error("Maçın aşaması bulunamadı");
  return phase;
}

function currentPhaseMatch(context: SocketContext, tournament: Tournament, matchId: string) {
  const match = context.store.matches.get(matchId);
  if (!match || match.tournamentId !== tournament.id) throw new Error("Maç bulunamadı");
  if (tournament.status === "finished") throw new Error("Turnuva bitti");
  if (match.isBye) throw new Error("BYE maçı değiştirilemez");
  if (match.phaseId !== getCurrentPhase(tournament).id) throw new Error("Sadece mevcut turdaki maçlar değiştirilebilir");
  return match;
}

function botsOnly(match: Match) {
  return Boolean(match.player1.isTest && match.player2.isTest);
}

function isOnline(lobby: Lobby, playerId: string) {
  const player = lobby.players.find((candidate) => candidate.id === playerId);
  return Boolean(player?.isTest || player?.connectionStatus === "online");
}

function hasLeft(lobby: Lobby, playerId: string) {
  const player = lobby.players.find((candidate) => candidate.id === playerId);
  return !player || player.isEliminated;
}

function setEliminated(lobby: Lobby, ref: PlayerRef | null, value: boolean) {
  if (!ref || ref.isBye) return;
  const player = lobby.players.find((candidate) => candidate.id === ref.id);
  if (player) player.isEliminated = value;
}

function log(context: SocketContext, tournament: Tournament, type: AdminActionType, payload: Record<string, unknown> = {}) {
  context.store.addAdminAction(createAdminAction(tournament, tournament.adminPlayerId, type, payload));
}
