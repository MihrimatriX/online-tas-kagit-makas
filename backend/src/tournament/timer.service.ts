import { Match, Move } from "./tournament.types.js";

export const MOVE_TIMEOUT_MS = 10_000;
export const COUNTDOWN_MS = 3_000;
const MOVES: Move[] = ["rock", "paper", "scissors"];

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const countdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type MoveTimeoutHandler = (match: Match, playerId: string, move: Move) => void;

export function startMatchClock(
  match: Match,
  onTimeout: MoveTimeoutHandler,
  onReady?: (match: Match) => void,
  options: { countdownMs?: number; moveMs?: number } = {}
) {
  const countdownMs = options.countdownMs ?? COUNTDOWN_MS;
  const moveMs = options.moveMs ?? MOVE_TIMEOUT_MS;
  clearMatchClock(match.id, match);
  if (countdownMs <= 0) {
    startMoveTimer(match, onTimeout, moveMs);
    onReady?.(match);
    return;
  }
  match.countdownEndsAt = new Date(Date.now() + countdownMs).toISOString();
  const timer = setTimeout(() => {
    countdownTimers.delete(match.id);
    match.countdownEndsAt = null;
    startMoveTimer(match, onTimeout, moveMs);
    onReady?.(match);
  }, countdownMs);
  countdownTimers.set(match.id, timer);
}

export function startMoveTimer(match: Match, onTimeout: MoveTimeoutHandler, moveMs = MOVE_TIMEOUT_MS) {
  clearMoveTimer(match.id);

  match.roundEndsAt = new Date(Date.now() + moveMs).toISOString();
  const timer = setTimeout(() => {
    activeTimers.delete(match.id);
    match.roundEndsAt = null;

    const missingPlayers: string[] = [];
    if (!match.pendingMoves[match.player1.id] && !match.player1.isBye) {
      missingPlayers.push(match.player1.id);
    }
    if (!match.pendingMoves[match.player2.id] && !match.player2.isBye) {
      missingPlayers.push(match.player2.id);
    }

    for (const playerId of missingPlayers) {
      const randomMove = MOVES[Math.floor(Math.random() * MOVES.length)];
      onTimeout(match, playerId, randomMove);
    }
  }, moveMs);

  activeTimers.set(match.id, timer);
}

export function ensureMoveTimer(match: Match, onTimeout: MoveTimeoutHandler, moveMs = MOVE_TIMEOUT_MS) {
  if (activeTimers.has(match.id) || countdownTimers.has(match.id)) return;
  startMoveTimer(match, onTimeout, moveMs);
}

export function clearMoveTimer(matchId: string, match?: Match) {
  const existing = activeTimers.get(matchId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(matchId);
  }
  if (match) match.roundEndsAt = null;
}

export function clearMatchClock(matchId: string, match?: Match) {
  const countdown = countdownTimers.get(matchId);
  if (countdown) {
    clearTimeout(countdown);
    countdownTimers.delete(matchId);
  }
  if (match) match.countdownEndsAt = null;
  clearMoveTimer(matchId, match);
}

export function pauseMatchTimers(matches: Match[]) {
  for (const match of matches) {
    if (match.status === "playing") {
      clearMatchClock(match.id, match);
      match.status = "paused";
    }
  }
}

export function resumeMatchTimers(matches: Match[], onTimeout: MoveTimeoutHandler, moveMs = MOVE_TIMEOUT_MS) {
  for (const match of matches) {
    if (match.status === "paused") {
      match.status = "playing";
      startMoveTimer(match, onTimeout, moveMs);
    }
  }
}

export function clearAllTimers() {
  for (const timer of activeTimers.values()) clearTimeout(timer);
  for (const timer of countdownTimers.values()) clearTimeout(timer);
  activeTimers.clear();
  countdownTimers.clear();
}
