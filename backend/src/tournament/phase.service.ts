import { Match, PlayerRef, Tournament, TournamentPhase } from "./tournament.types.js";
import { nowIso } from "./bracket.service.js";

export function getCurrentPhase(tournament: Tournament) {
  return tournament.phases[tournament.currentPhaseIndex];
}

export function getPhaseMatches(phase: TournamentPhase, matchesById: Map<string, Match>) {
  return phase.matchIds
    .map((matchId) => matchesById.get(matchId))
    .filter((match): match is Match => Boolean(match));
}

export function canStartPhase(tournament: Tournament, phase: TournamentPhase) {
  return tournament.status === "active" && phase.status === "waiting" && phase.matchIds.length > 0;
}

export function canCompletePhase(phase: TournamentPhase, matches: Match[]) {
  return (
    phase.status === "active" &&
    matches.length > 0 &&
    matches.every((match) => match.status === "finished" || match.status === "walkover")
  );
}

export function completePhaseIfReady(phase: TournamentPhase, matches: Match[]) {
  if (!canCompletePhase(phase, matches)) return false;

  phase.status = "completed";
  phase.completedAt = nowIso();
  phase.winners = collectPhaseWinners(matches);
  return true;
}

export function collectPhaseWinners(matches: Match[]): PlayerRef[] {
  return matches
    .map((match) => match.winner)
    .filter((winner): winner is PlayerRef => Boolean(winner))
    .filter((winner) => !winner.isBye);
}

export function canAdvancePhase(tournament: Tournament, phase: TournamentPhase, matches: Match[]) {
  const allMatchesFinished = matches.every(
    (match) => match.status === "finished" || match.status === "walkover"
  );

  return tournament.status !== "finished" && phase.status === "completed" && allMatchesFinished;
}

export function getNextPhase(tournament: Tournament) {
  return tournament.phases[tournament.currentPhaseIndex + 1] ?? null;
}

export function activateNextPhase(tournament: Tournament, nextPhase: TournamentPhase) {
  tournament.currentPhaseIndex = nextPhase.phaseIndex;
  tournament.currentPhaseKey = nextPhase.phaseKey;
  nextPhase.status = "waiting";
  nextPhase.lockedByAdmin = false;
  tournament.updatedAt = nowIso();
}
