import { Match, MatchRound, Move, PlayerRef } from "./tournament.types.js";
import { nowIso } from "./bracket.service.js";

export interface MoveResolution {
  match: Match;
  round: MatchRound | null;
  isRoundComplete: boolean;
  isMatchComplete: boolean;
}

export function startMatch(match: Match) {
  if (match.status !== "waiting") return match;

  match.status = "playing";
  match.startedAt = nowIso();
  return match;
}

export function registerMove(match: Match, playerId: string, move: Move, winningScore = 3): MoveResolution {
  if (match.status !== "playing") {
    throw new Error("Maç oynanabilir değil");
  }

  if (match.countdownEndsAt && new Date(match.countdownEndsAt).getTime() > Date.now()) {
    throw new Error("Geri sayım bitmeden hamle yapılamaz");
  }

  if (match.player1.id !== playerId && match.player2.id !== playerId) {
    throw new Error("Bu maçın oyuncusu değilsin");
  }

  if (match.pendingMoves[playerId]) {
    throw new Error("Hamle zaten kilitli");
  }

  match.pendingMoves[playerId] = move;

  const p1Move = match.pendingMoves[match.player1.id];
  const p2Move = match.pendingMoves[match.player2.id];

  if (!p1Move || !p2Move) {
    return {
      match,
      round: null,
      isRoundComplete: false,
      isMatchComplete: false
    };
  }

  const roundWinnerId = resolveRoundWinner(match.player1.id, p1Move, match.player2.id, p2Move);
  const round: MatchRound = {
    roundNumber: match.rounds.length + 1,
    p1Move,
    p2Move,
    winner: roundWinnerId
  };

  match.rounds.push(round);
  match.pendingMoves = {};

  if (roundWinnerId === match.player1.id) {
    match.player1.score += 1;
  }

  if (roundWinnerId === match.player2.id) {
    match.player2.score += 1;
  }

  let isMatchComplete = false;
  if (match.player1.score >= winningScore || match.player2.score >= winningScore) {
    finishMatch(match, match.player1.score > match.player2.score ? match.player1 : match.player2);
    isMatchComplete = true;
  }

  return {
    match,
    round,
    isRoundComplete: true,
    isMatchComplete
  };
}

export function assignWinner(match: Match, winnerId: string, status: "finished" | "walkover" = "finished") {
  const winner = [match.player1, match.player2].find((player) => player.id === winnerId);
  if (!winner) {
    throw new Error("Winner is not part of this match");
  }

  finishMatch(match, winner, status);
  return match;
}

export function resetMatch(match: Match) {
  match.player1.score = 0;
  match.player2.score = 0;
  match.rounds = [];
  match.pendingMoves = {};
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

function finishMatch(match: Match, winner: PlayerRef, status: "finished" | "walkover" = "finished") {
  const loser = winner.id === match.player1.id ? match.player2 : match.player1;
  match.winner = {
    id: winner.id,
    name: winner.name,
    isBye: winner.isBye
  };
  match.loser = {
    id: loser.id,
    name: loser.name,
    isBye: loser.isBye
  };
  match.status = status;
  match.finishedAt = nowIso();
}

function resolveRoundWinner(p1Id: string, p1Move: Move, p2Id: string, p2Move: Move) {
  if (p1Move === p2Move) return null;

  if (
    (p1Move === "rock" && p2Move === "scissors") ||
    (p1Move === "paper" && p2Move === "rock") ||
    (p1Move === "scissors" && p2Move === "paper")
  ) {
    return p1Id;
  }

  return p2Id;
}
