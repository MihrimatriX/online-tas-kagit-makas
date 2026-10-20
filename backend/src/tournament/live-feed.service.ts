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
  return { id: createId("feed"), lobbyId, type, text, timestamp: nowIso(), ...meta };
}

export function phaseWaitingEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(lobbyId, "phase_waiting", `Eşleşmeler çekildi. ${phase.name} başlamayı bekliyor.`, {
    phaseId: phase.id
  });
}

export function phaseStartedEvent(lobbyId: string, phase: TournamentPhase, matchCount: number) {
  return createFeedEvent(lobbyId, "phase_started", `${phase.name} başladı · ${matchCount} maç.`, { phaseId: phase.id });
}

export function phaseCompletedEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(lobbyId, "phase_completed", `${phase.name} tamamlandı.`, { phaseId: phase.id });
}

export function phaseAdvancedEvent(lobbyId: string, phase: TournamentPhase) {
  return createFeedEvent(lobbyId, "phase_advanced", `${phase.name} eşleşmeleri belli oldu.`, { phaseId: phase.id });
}

export function byeAdvanceEvent(lobbyId: string, match: Match) {
  return createFeedEvent(lobbyId, "bye_advance", `${match.winner?.name ?? "Bir oyuncu"} rakipsiz, BYE ile tur atladı.`, {
    matchId: match.id,
    phaseId: match.phaseId
  });
}

export function roundResultEvent(lobbyId: string, match: Match, round: MatchRound) {
  const score = `${match.player1.score}–${match.player2.score}`;
  const moves = `${MOVE_LABELS[round.p1Move]} × ${MOVE_LABELS[round.p2Move]}`;
  if (!round.winner) {
    return createFeedEvent(lobbyId, "match_draw_round", `${match.player1.name} – ${match.player2.name}: ${moves}, berabere (${score})`, {
      matchId: match.id,
      phaseId: match.phaseId
    });
  }
  const winnerName = round.winner === match.player1.id ? match.player1.name : match.player2.name;
  return createFeedEvent(lobbyId, "round_result", `${match.player1.name} – ${match.player2.name}: ${moves}, ${winnerName} +1 (${score})`, {
    matchId: match.id,
    phaseId: match.phaseId
  });
}

export function matchFinishedText(match: Match) {
  const winnerIsP1 = match.winner?.id === match.player1.id;
  const winnerScore = winnerIsP1 ? match.player1.score : match.player2.score;
  const loserScore = winnerIsP1 ? match.player2.score : match.player1.score;
  return `${match.winner?.name ?? "Kazanan"} ${winnerScore}–${loserScore} ile ${match.loser?.name ?? "rakibini"} eledi · ${match.phaseName}`;
}

export function tournamentWinnerEvent(lobbyId: string, champion: PlayerRef) {
  return createFeedEvent(lobbyId, "tournament_winner", `${champion.name} turnuvanın şampiyonu!`);
}
