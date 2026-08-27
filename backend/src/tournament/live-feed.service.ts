import {
  ActivityFeedEvent,
  ActivityFeedType,
  Match,
  MatchRound,
  MOVE_LABELS,
  PlayerRef,
  TournamentPhase
} from "./tournament.types.js";
import { createId, nowIso } from "./bracket.service.js";

export function createFeedEvent(
  lobbyId: string,
  type: ActivityFeedType,
  text: string,
  meta: Pick<ActivityFeedEvent, "matchId" | "phaseId"> = {}
): ActivityFeedEvent {
  return {
    id: createId("feed"),
    lobbyId,
    type,
    text,
    timestamp: nowIso(),
    ...meta
  };
}

export function phaseWaitingEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(
    lobbyId,
    "phase_waiting",
    `${phase.name} hazır. Admin başlatmayı bekliyor.`,
    { phaseId: phase.id }
  );
}

export function phaseStartedEvent(lobbyId: string, phase: TournamentPhase, activeMatchCount: number) {
  return createFeedEvent(
    lobbyId,
    "phase_started",
    `${phase.name} başladı. ${activeMatchCount} aktif maç var.`,
    { phaseId: phase.id }
  );
}

export function phaseCompletedEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(lobbyId, "phase_completed", `${phase.name} tamamlandı.`, {
    phaseId: phase.id
  });
}

export function phaseAdvancedEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(lobbyId, "phase_advanced", `${phase.name} eşleşmeleri hazırlandı.`, {
    phaseId: phase.id
  });
}

export function byeAdvanceEvent(lobbyId: string, match: Match) {
  return createFeedEvent(
    lobbyId,
    "bye_advance",
    `${match.winner?.name ?? "Bir oyuncu"} bu turda BYE aldı, otomatik geçti.`,
    { matchId: match.id, phaseId: match.phaseId }
  );
}

export function roundResultEvent(lobbyId: string, match: Match, round: MatchRound) {
  const winnerName = round.winner ? playerName(match, round.winner) : null;
  const type = round.winner ? "round_result" : "match_draw_round";
  const text = round.winner
    ? `${match.player1.name}: ${MOVE_LABELS[round.p1Move]} - ${match.player2.name}: ${MOVE_LABELS[round.p2Move]} -> ${winnerName} +1 (${match.player1.score}-${match.player2.score})`
    : `${match.player1.name} vs ${match.player2.name}: Berabere (${match.player1.score}-${match.player2.score})`;

  return createFeedEvent(lobbyId, type, text, { matchId: match.id, phaseId: match.phaseId });
}

export function matchFinishedEvent(lobbyId: string, match: Match) {
  const winnerScore = match.winner?.id === match.player1.id ? match.player1.score : match.player2.score;
  const loserScore = match.winner?.id === match.player1.id ? match.player2.score : match.player1.score;
  return createFeedEvent(
    lobbyId,
    "match_finished",
    `${match.winner?.name ?? "Kazanan"}, ${match.loser?.name ?? "rakibini"} ${winnerScore}-${loserScore} yenerek ${match.phaseName} aşamasını geçti.`,
    { matchId: match.id, phaseId: match.phaseId }
  );
}

export function tournamentWinnerEvent(lobbyId: string, champion: PlayerRef) {
  return createFeedEvent(
    lobbyId,
    "tournament_winner",
    `${champion.name} turnuva şampiyonu oldu!`
  );
}

function playerName(match: Match, playerId: string) {
  if (match.player1.id === playerId) return match.player1.name;
  if (match.player2.id === playerId) return match.player2.name;
  return "Kazanan";
}
