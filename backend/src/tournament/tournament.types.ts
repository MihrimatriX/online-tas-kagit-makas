export type TournamentPhaseKey =
  | "round_of_64"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "final"
  | "champion";

export type PlayablePhaseKey = Exclude<TournamentPhaseKey, "champion">;

export type TournamentStatus = "waiting" | "seeded" | "active" | "paused" | "finished";
export type LobbyStatus = "waiting" | "active" | "finished";
export type PhaseStatus = "locked" | "waiting" | "active" | "completed";
export type MatchStatus = "waiting" | "playing" | "paused" | "finished" | "walkover";
export type Move = "rock" | "paper" | "scissors";
export type RoundAdvanceMode = "manual" | "automatic" | "hybrid";

export const PHASE_ORDER: TournamentPhaseKey[] = [
  "round_of_64",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
  "champion"
];

export const PHASE_LABELS: Record<TournamentPhaseKey, string> = {
  round_of_64: "Son 64",
  round_of_32: "Son 32",
  round_of_16: "Son 16",
  quarter_final: "Çeyrek Final",
  semi_final: "Yarı Final",
  final: "Final",
  champion: "Şampiyon"
};

export const MOVE_LABELS: Record<Move, string> = {
  rock: "Taş",
  paper: "Kağıt",
  scissors: "Makas"
};

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  reconnectToken?: string;
  isReady: boolean;
  isAdmin: boolean;
  isTest?: boolean;
  isEliminated: boolean;
  connectionStatus: "online" | "offline";
  createdAt: string;
}

export interface RoomSettings {
  winningScore: number;
  moveSeconds: number;
  countdownSeconds: number;
  autoAdvance: boolean;
}

export function defaultRoomSettings(): RoomSettings {
  return {
    winningScore: 3,
    moveSeconds: 10,
    countdownSeconds: 3,
    autoAdvance: false
  };
}

export function normalizeRoomSettings(
  input: Partial<RoomSettings> | undefined,
  current: RoomSettings = defaultRoomSettings()
): RoomSettings {
  const winningScore = clamp(Number(input?.winningScore ?? current.winningScore), 2, 5);
  const moveSeconds = clamp(Number(input?.moveSeconds ?? current.moveSeconds), 5, 20);
  const countdownSeconds = clamp(Number(input?.countdownSeconds ?? current.countdownSeconds), 0, 5);
  return {
    winningScore,
    moveSeconds,
    countdownSeconds,
    autoAdvance: Boolean(input?.autoAdvance ?? current.autoAdvance)
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clockFromLobby(lobby?: { settings?: RoomSettings } | null) {
  const settings = lobby?.settings ?? defaultRoomSettings();
  return {
    winningScore: settings.winningScore,
    moveMs: settings.moveSeconds * 1000,
    countdownMs: settings.countdownSeconds * 1000
  };
}

export interface PlayerRef {
  id: string;
  name: string;
  isBye?: boolean;
}

export interface Lobby {
  id: string;
  code: string;
  name: string;
  status: LobbyStatus;
  adminPlayerId: string;
  players: Player[];
  tournamentId: string | null;
  isTest?: boolean;
  overlayEnabled: boolean;
  settings: RoomSettings;
  createdAt: string;
}

export interface Tournament {
  id: string;
  lobbyId: string;
  status: TournamentStatus;
  adminPlayerId: string;
  currentPhaseIndex: number;
  currentPhaseKey: TournamentPhaseKey;
  phases: TournamentPhase[];
  champion: PlayerRef | null;
  roundAdvanceMode: RoundAdvanceMode;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentPhase {
  id: string;
  phaseIndex: number;
  phaseKey: TournamentPhaseKey;
  name: string;
  status: PhaseStatus;
  matchIds: string[];
  winners: PlayerRef[];
  startedAt: string | null;
  completedAt: string | null;
  createdBy: "system" | "admin";
  startedBy: string | null;
  lockedByAdmin: boolean;
}

export interface MatchPlayer extends PlayerRef {
  score: number;
}

export interface MatchRound {
  roundNumber: number;
  p1Move: Move;
  p2Move: Move;
  winner: string | null;
}

export interface Match {
  id: string;
  tournamentId: string;
  phaseId: string;
  phaseKey: PlayablePhaseKey;
  phaseName: string;
  matchNumber: number;
  player1: MatchPlayer;
  player2: MatchPlayer;
  rounds: MatchRound[];
  status: MatchStatus;
  winner: PlayerRef | null;
  loser: PlayerRef | null;
  isBye: boolean;
  pendingMoves: Partial<Record<string, Move>>;
  roundEndsAt: string | null;
  countdownEndsAt: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type ActivityFeedType =
  | "phase_waiting"
  | "phase_started"
  | "phase_paused"
  | "phase_resumed"
  | "phase_completed"
  | "phase_advanced"
  | "round_result"
  | "match_finished"
  | "match_draw_round"
  | "bye_advance"
  | "tournament_winner"
  | "admin_action";

export interface ActivityFeedEvent {
  id: string;
  lobbyId: string;
  type: ActivityFeedType;
  text: string;
  timestamp: string;
  matchId?: string;
  phaseId?: string;
}

export interface AdminAction {
  id: string;
  tournamentId: string;
  adminPlayerId: string;
  actionType:
    | "TOURNAMENT_SEEDED"
    | "TOURNAMENT_STARTED"
    | "PHASE_STARTED"
    | "PHASE_PAUSED"
    | "PHASE_RESUMED"
    | "PHASE_COMPLETED"
    | "PHASE_ADVANCED"
    | "MATCH_RESTARTED"
    | "MATCH_WINNER_ASSIGNED"
    | "CHAMPION_SHOWN"
    | "PLAYER_KICKED"
    | "FEED_CLEARED"
    | "OVERLAY_TOGGLED"
    | "ADVANCE_MODE_SET"
    | "ADMIN_TRANSFERRED"
    | "ROOM_UPDATED";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PhaseBracketSnapshot {
  phaseKey: TournamentPhaseKey;
  name: string;
  status: PhaseStatus;
  matches: SafeMatch[];
}

export type SafeMatch = Omit<Match, "pendingMoves"> & { lockedPlayerIds: string[] };

export interface TournamentSnapshot {
  lobby: Lobby;
  tournament: Tournament | null;
  bracket: PhaseBracketSnapshot[];
  activeMatches: SafeMatch[];
  feed: ActivityFeedEvent[];
  adminActions: AdminAction[];
}

export interface ClientSession {
  socketId: string;
  playerId: string | null;
  lobbyId: string | null;
  isSpectator?: boolean;
}
