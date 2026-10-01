import { Match, PlayerRef, Tournament, TournamentPhase } from "./tournament.types.js";
import { nowIso } from "./bracket.service.js";
import { isMatchDone } from "./match.service.js";

export function getCurrentPhase(tournament: Tournament) {
  return tournament.phases[tournament.currentPhaseIndex];
}

export function getNextPhase(tournament: Tournament) {
  return tournament.phases[tournament.currentPhaseIndex + 1] ?? null;
}

export function getPhaseMatches(phase: TournamentPhase, matchesById: Map<string, Match>) {
  return phase.matchIds
    .map((matchId) => matchesById.get(matchId))
    .filter((match): match is Match => Boolean(match));
}

export function collectPhaseWinners(matches: Match[]): PlayerRef[] {
  return matches
    .map((match) => match.winner)
    .filter((winner): winner is PlayerRef => Boolean(winner && !winner.isBye));
}

/** Marks an active phase completed once every match has a result. */
export function completePhaseIfReady(phase: TournamentPhase, matches: Match[]) {
  if (phase.status !== "active" || matches.length === 0 || !matches.every(isMatchDone)) return false;
  phase.status = "completed";
  phase.completedAt = nowIso();
  phase.winners = collectPhaseWinners(matches);
  return true;
}

export function activatePhase(tournament: Tournament, phase: TournamentPhase) {
  tournament.currentPhaseIndex = phase.phaseIndex;
  tournament.currentPhaseKey = phase.phaseKey;
  tournament.updatedAt = nowIso();
  phase.status = "waiting";
}
