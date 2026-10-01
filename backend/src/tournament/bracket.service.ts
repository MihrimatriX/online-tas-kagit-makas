import {
  Match,
  MatchPlayer,
  PHASE_LABELS,
  PHASE_ORDER,
  PhaseBracketSnapshot,
  PlayablePhaseKey,
  Player,
  PlayerRef,
  SafeMatch,
  TournamentPhase
} from "./tournament.types.js";

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function nextPowerOf2(n: number) {
  if (n < 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function getBracketSize(playerCount: number) {
  const size = nextPowerOf2(playerCount);
  if (![2, 4, 8, 16, 32, 64].includes(size)) {
    throw new Error("Turnuva 2 ile 64 oyuncu arasında olmalı");
  }
  return size;
}

const STARTING_PHASE: Record<number, PlayablePhaseKey> = {
  64: "round_of_64",
  32: "round_of_32",
  16: "round_of_16",
  8: "quarter_final",
  4: "semi_final",
  2: "final"
};

export function buildTournamentPhases(bracketSize: number): TournamentPhase[] {
  const startKey = STARTING_PHASE[bracketSize];
  if (!startKey) throw new Error("Desteklenmeyen tablo boyutu");

  return PHASE_ORDER.slice(PHASE_ORDER.indexOf(startKey)).map((phaseKey, index) => ({
    id: createId(`phase_${phaseKey}`),
    phaseIndex: index,
    phaseKey,
    name: PHASE_LABELS[phaseKey],
    status: index === 0 ? "waiting" : "locked",
    matchIds: [],
    winners: [],
    startedAt: null,
    completedAt: null
  }));
}

export function createInitialPhaseMatches(players: Player[], phase: TournamentPhase, tournamentId: string): Match[] {
  const seeded = padWithByes(
    shuffle(players).map((player) => ({ ...toPlayerRef(player), score: 0 })),
    nextPowerOf2(players.length)
  );
  return createMatchesFromPlayers(seeded, phase, tournamentId);
}

export function createNextPhaseMatches(winners: PlayerRef[], nextPhase: TournamentPhase, tournamentId: string): Match[] {
  if (nextPhase.phaseKey === "champion") return [];
  return createMatchesFromPlayers(
    winners.map((winner) => ({ ...toPlayerRef(winner), score: 0 })),
    nextPhase,
    tournamentId
  );
}

export function safeMatch(match: Match): SafeMatch {
  const { pendingMoves, missedMoves: _missed, ...safe } = match;
  return { ...safe, lockedPlayerIds: Object.keys(pendingMoves) };
}

export function buildBracketSnapshot(phases: TournamentPhase[], matchesById: Map<string, Match>): PhaseBracketSnapshot[] {
  return phases.map((phase) => ({
    phaseKey: phase.phaseKey,
    name: phase.name,
    status: phase.status,
    matches: phase.matchIds
      .map((matchId) => matchesById.get(matchId))
      .filter((match): match is Match => Boolean(match))
      .map(safeMatch)
  }));
}

export function toPlayerRef(player: PlayerRef): PlayerRef {
  const ref: PlayerRef = { id: player.id, name: player.name };
  if (player.isBye) ref.isBye = true;
  if (player.isTest) ref.isTest = true;
  return ref;
}

function createMatchesFromPlayers(seeded: MatchPlayer[], phase: TournamentPhase, tournamentId: string) {
  if (phase.phaseKey === "champion") {
    throw new Error("Şampiyon aşamasında maç olmaz");
  }

  const matches: Match[] = [];
  const createdAt = nowIso();

  for (let i = 0; i < seeded.length; i += 2) {
    const player1 = seeded[i];
    const player2 = seeded[i + 1];
    if (player1.isBye && player2.isBye) {
      throw new Error("BYE vs BYE pairing is not allowed");
    }
    const byeWinner = player1.isBye ? player2 : player2.isBye ? player1 : null;
    const byeLoser = byeWinner === player1 ? player2 : player1;

    matches.push({
      id: createId(`${phase.phaseKey}_match_${i / 2 + 1}`),
      tournamentId,
      phaseId: phase.id,
      phaseKey: phase.phaseKey,
      phaseName: phase.name,
      matchNumber: i / 2 + 1,
      player1,
      player2,
      rounds: [],
      status: byeWinner ? "finished" : "waiting",
      winner: byeWinner ? toPlayerRef(byeWinner) : null,
      loser: byeWinner ? toPlayerRef(byeLoser) : null,
      isBye: Boolean(byeWinner),
      pendingMoves: {},
      missedMoves: {},
      roundEndsAt: null,
      countdownEndsAt: null,
      createdAt,
      startedAt: null,
      finishedAt: byeWinner ? createdAt : null
    });
  }

  return matches;
}

/** Every BYE is paired with a real player, so no BYE-vs-BYE match can exist. */
function padWithByes(players: MatchPlayer[], size: number) {
  const byesNeeded = size - players.length;
  if (byesNeeded < 0) throw new Error("Too many players for bracket size");

  const remaining = [...players];
  const seeded: MatchPlayer[] = [];

  for (let i = 0; i < byesNeeded; i += 1) {
    const player = remaining.shift();
    if (!player) throw new Error("BYE vs BYE pairing is not allowed");
    seeded.push(player, { id: `bye_${i + 1}`, name: "BYE", isBye: true, score: 0 });
  }

  seeded.push(...remaining);
  if (seeded.length !== size) throw new Error("Bracket padding mismatch");
  return seeded;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
