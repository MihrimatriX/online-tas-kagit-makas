import { Match } from "./tournament.types.js";

// One keyed registry for every server-side timer (round clocks, bot moves, admin hand-off,
// lobby compaction, auto-advance). Scheduling a key replaces any timer already under it.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function schedule(key: string, ms: number, fn: () => void) {
  cancel(key);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      try {
        fn();
      } catch (error) {
        // A throw inside setTimeout would take the whole process down.
        console.error(`timer ${key} failed`, error);
      }
    }, ms)
  );
}

export function isScheduled(key: string) {
  return timers.has(key);
}

export function cancel(key: string) {
  const timer = timers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  timers.delete(key);
}

export function cancelPrefix(prefix: string) {
  for (const key of timers.keys()) {
    if (key.startsWith(prefix)) cancel(key);
  }
}

export function clearAllTimers() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

export interface RoundClock {
  /** Lead-in before moves are accepted: match start countdown, or the reveal of the previous round. */
  countdownMs: number;
  moveMs: number;
  onOpen: () => void;
  onTimeout: (missingPlayerIds: string[]) => void;
}

export function startRoundClock(match: Match, clock: RoundClock) {
  clearMatchClock(match);

  const open = () => {
    match.countdownEndsAt = null;
    match.roundEndsAt = new Date(Date.now() + clock.moveMs).toISOString();
    schedule(`move:${match.id}`, clock.moveMs, () => {
      match.roundEndsAt = null;
      if (match.status !== "playing") return;
      const missing = [match.player1, match.player2]
        .filter((player) => !player.isBye && !match.pendingMoves[player.id])
        .map((player) => player.id);
      if (missing.length) clock.onTimeout(missing);
    });
    clock.onOpen();
  };

  if (clock.countdownMs <= 0) {
    open();
    return;
  }
  match.countdownEndsAt = new Date(Date.now() + clock.countdownMs).toISOString();
  schedule(`countdown:${match.id}`, clock.countdownMs, open);
}

export function clearMatchClock(match: Match) {
  cancel(`countdown:${match.id}`);
  cancel(`move:${match.id}`);
  cancelPrefix(`bot:${match.id}:`);
  match.countdownEndsAt = null;
  match.roundEndsAt = null;
}
