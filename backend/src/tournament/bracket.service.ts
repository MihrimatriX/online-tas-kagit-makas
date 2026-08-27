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
  TournamentPhase,
  TournamentPhaseKey
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
    throw new Error("Supported bracket sizes are 2, 4, 8, 16, 32 and 64");
  }
  return size;
}

export function getStartingPhaseKey(bracketSize: number): PlayablePhaseKey {
  switch (bracketSize) {
    case 64:
      return "round_of_64";
    case 32:
      return "round_of_32";
    case 16:
      return "round_of_16";
    case 8:
      return "quarter_final";
    case 4:
      return "semi_final";
    case 2:
      return "final";
    default:
      throw new Error("Unsupported bracket size");
  }
}

export function buildTournamentPhases(bracketSize: number): TournamentPhase[] {
  const startKey = getStartingPhaseKey(bracketSize);
  const startIndex = PHASE_ORDER.indexOf(startKey);

  return PHASE_ORDER.slice(startIndex).map((phaseKey, index) => ({
    id: createId(`phase_${phaseKey}`),
    phaseIndex: index,
    phaseKey,
    name: PHASE_LABELS[phaseKey],
    status: index === 0 ? "waiting" : "locked",
    matchIds: [],
    winners: [],
    startedAt: null,
    completedAt: null,
    createdBy: "system",
    startedBy: null,
    lockedByAdmin: index !== 0
  }));
}

export function createInitialPhaseMatches(
  players: Player[],
  phase: TournamentPhase,
  tournamentId: string
): Match[] {
  if (phase.phaseKey === "champion") {
    throw new Error("Champion phase cannot contain playable matches");
  }

  const seeded = padWithByes(
    shuffle(players).map((player) => toMatchPlayer(player)),
    nextPowerOf2(players.length)
  );

  return createMatchesFromPlayers(seeded, phase, tournamentId);
}

export function createNextPhaseMatches(
  previousPhaseWinners: PlayerRef[],
  nextPhase: TournamentPhase,
  tournamentId: string
): Match[] {
  if (nextPhase.phaseKey === "champion") {
    return [];
  }

  const players = previousPhaseWinners.map((winner) => ({
    ...winner,
    score: 0
  }));

  return createMatchesFromPlayers(players, nextPhase, tournamentId);
}

export function safeMatch(match: Match): SafeMatch {
  const { pendingMoves, ...safe } = match;
  return {
    ...safe,
    lockedPlayerIds: Object.keys(pendingMoves)
  };
}

export function buildBracketSnapshot(
  phases: TournamentPhase[],
  matchesById: Map<string, Match>
): PhaseBracketSnapshot[] {
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

function createMatchesFromPlayers(
  seeded: MatchPlayer[],
  phase: TournamentPhase,
  tournamentId: string
) {
  if (phase.phaseKey === "champion") {
    throw new Error("Champion phase cannot contain playable matches");
  }

  const matches: Match[] = [];
  const createdAt = nowIso();

  for (let i = 0; i < seeded.length; i += 2) {
    const player1 = seeded[i];
    const player2 = seeded[i + 1];
    if (player1.isBye && player2.isBye) {
      throw new Error("BYE vs BYE pairing is not allowed");
    }
    const byeWinner = getByeWinner(player1, player2);
    const isBye = Boolean(byeWinner);

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
      status: isBye ? "finished" : "waiting",
      winner: byeWinner,
      loser: isBye ? (byeWinner?.id === player1.id ? player2 : player1) : null,
      isBye,
      pendingMoves: {},
      roundEndsAt: null,
      countdownEndsAt: null,
      createdAt,
      startedAt: null,
      finishedAt: isBye ? createdAt : null
    });
  }

  return matches;
}

function toMatchPlayer(player: Player): MatchPlayer {
  return {
    id: player.id,
    name: player.name,
    score: 0
  };
}

function getByeWinner(player1: MatchPlayer, player2: MatchPlayer): PlayerRef | null {
  if (player1.isBye && !player2.isBye) return toPlayerRef(player2);
  if (!player1.isBye && player2.isBye) return toPlayerRef(player1);
  return null;
}

function toPlayerRef(player: MatchPlayer): PlayerRef {
  return {
    id: player.id,
    name: player.name,
    isBye: player.isBye
  };
}

function padWithByes(players: MatchPlayer[], size: number) {
  const byesNeeded = size - players.length;
  if (byesNeeded < 0) throw new Error("Too many players for bracket size");

  const remaining = [...players];
  const seeded: MatchPlayer[] = [];

  for (let i = 0; i < byesNeeded; i += 1) {
    const player = remaining.shift();
    if (!player) throw new Error("BYE vs BYE pairing is not allowed");
    seeded.push(player, makeBye(i + 1));
  }

  seeded.push(...remaining);
  if (seeded.length !== size) throw new Error("Bracket padding mismatch");
  return seeded;
}

function makeBye(index: number): MatchPlayer {
  return {
    id: `bye_${index}`,
    name: "BYE",
    isBye: true,
    score: 0
  };
}

function shuffle<T>(items: T[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}
