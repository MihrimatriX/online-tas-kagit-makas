import { Match, MatchRound, Move, PlayerRef } from "./tournament.types.js";
import { nowIso, toPlayerRef } from "./bracket.service.js";

export interface MoveResolution {
  round: MatchRound | null;
  isMatchComplete: boolean;
}

export function startMatch(match: Match) {
  if (match.status !== "waiting") return match;
  match.status = "playing";
  match.startedAt = nowIso();
  return match;
}

export function registerMove(match: Match, playerId: string, move: Move, winningScore: number): MoveResolution {
  if (match.status !== "playing") throw new Error("Maç şu an oynanmıyor");
  if (match.countdownEndsAt && Date.parse(match.countdownEndsAt) > Date.now()) {
    throw new Error("Geri sayım bitmeden hamle yapılamaz");
  }
  if (match.player1.id !== playerId && match.player2.id !== playerId) {
    throw new Error("Bu maçın oyuncusu değilsin");
  }
  if (match.pendingMoves[playerId]) throw new Error("Hamle zaten kilitli");

  match.pendingMoves[playerId] = move;
  const p1Move = match.pendingMoves[match.player1.id];
  const p2Move = match.pendingMoves[match.player2.id];
  if (!p1Move || !p2Move) return { round: null, isMatchComplete: false };

  const winner = resolveRoundWinner(match.player1.id, p1Move, match.player2.id, p2Move);
  const round: MatchRound = { roundNumber: match.rounds.length + 1, p1Move, p2Move, winner };
  match.rounds.push(round);
  match.pendingMoves = {};
  if (winner === match.player1.id) match.player1.score += 1;
  if (winner === match.player2.id) match.player2.score += 1;

  const leader = match.player1.score >= winningScore ? match.player1 : match.player2.score >= winningScore ? match.player2 : null;
  if (leader) finishMatch(match, leader);
  return { round, isMatchComplete: Boolean(leader) };
}

export function assignWinner(match: Match, winnerId: string, status: "finished" | "walkover" = "finished") {
  const winner = [match.player1, match.player2].find((player) => player.id === winnerId);
  if (!winner) throw new Error("Kazanan bu maçın oyuncusu değil");
  finishMatch(match, winner, status);
  return match;
}

export function resetMatch(match: Match) {
  match.player1.score = 0;
  match.player2.score = 0;
  match.rounds = [];
  match.pendingMoves = {};
  match.missedMoves = {};
  match.roundEndsAt = null;
  match.countdownEndsAt = null;
  match.status = "waiting";
  match.winner = null;
  match.loser = null;
  match.startedAt = null;
  match.finishedAt = null;
  return match;
}

export function isValidMove(value: unknown): value is Move {
  return value === "rock" || value === "paper" || value === "scissors";
}

export function isMatchDone(match: Match) {
  return match.status === "finished" || match.status === "walkover";
}

export function opponentOf(match: Match, playerId: string) {
  return match.player1.id === playerId ? match.player2 : match.player1;
}

export type TimeoutAction = "random_move" | "forfeit_match";

/**
 * A player let the move clock run out. Decide whether the server plays a random move
 * for them or hands the match to their opponent.
 *
 * @param missedInARow how many move windows in a row this player has now missed (1 = first miss)
 * @param isOnline     whether their socket is currently connected (bots always count as online)
 */
export function timeoutAction(missedInARow: number, isOnline: boolean): TimeoutAction {
  // TODO(human): pick the AFK / disconnect policy.
  void missedInARow;
  void isOnline;
  return "random_move";
}

function finishMatch(match: Match, winner: PlayerRef, status: "finished" | "walkover" = "finished") {
  match.winner = toPlayerRef(winner);
  match.loser = toPlayerRef(opponentOf(match, winner.id));
  match.status = status;
  match.pendingMoves = {};
  match.roundEndsAt = null;
  match.countdownEndsAt = null;
  match.finishedAt = nowIso();
}

const BEATS: Record<Move, Move> = { rock: "scissors", paper: "rock", scissors: "paper" };

function resolveRoundWinner(p1Id: string, p1Move: Move, p2Id: string, p2Move: Move) {
  if (p1Move === p2Move) return null;
  return BEATS[p1Move] === p2Move ? p1Id : p2Id;
}
