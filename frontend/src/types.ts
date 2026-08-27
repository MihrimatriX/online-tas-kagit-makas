export type TournamentPhaseKey =
  | "round_of_64"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "final"
  | "champion";

export type TournamentStatus = "waiting" | "seeded" | "active" | "paused" | "finished";
export type LobbyStatus = "waiting" | "active" | "finished";
export type PhaseStatus = "locked" | "waiting" | "active" | "completed";
export type MatchStatus = "waiting" | "playing" | "paused" | "finished" | "walkover";
export type Move = "rock" | "paper" | "scissors";

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

export interface PlayerRef {
  id: string;
  name: string;
  isBye?: boolean;
}

export interface RoomSettings {
  winningScore: number;
  moveSeconds: number;
  countdownSeconds: number;
  autoAdvance: boolean;
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
  overlayEnabled?: boolean;
  settings?: RoomSettings;
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
  roundAdvanceMode: "manual" | "automatic" | "hybrid";
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

export interface SafeMatch {
  id: string;
  tournamentId: string;
  phaseId: string;
  phaseKey: Exclude<TournamentPhaseKey, "champion">;
  phaseName: string;
  matchNumber: number;
  player1: MatchPlayer;
  player2: MatchPlayer;
  rounds: MatchRound[];
  status: MatchStatus;
  winner: PlayerRef | null;
  loser: PlayerRef | null;
  isBye: boolean;
  lockedPlayerIds: string[];
  roundEndsAt?: string | null;
  countdownEndsAt?: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PhaseBracketSnapshot {
  phaseKey: TournamentPhaseKey;
  name: string;
  status: PhaseStatus;
  matches: SafeMatch[];
}

export interface ActivityFeedEvent {
  id: string;
  lobbyId: string;
  type:
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
  text: string;
  timestamp: string;
  matchId?: string;
  phaseId?: string;
}

export interface AdminAction {
  id: string;
  tournamentId: string;
  adminPlayerId: string;
  actionType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TournamentSnapshot {
  lobby: Lobby;
  tournament: Tournament | null;
  bracket: PhaseBracketSnapshot[];
  activeMatches: SafeMatch[];
  feed: ActivityFeedEvent[];
  adminActions: AdminAction[];
}

export interface SessionState {
  playerId: string;
  lobbyId: string;
  lobbyCode: string;
  isAdmin: boolean;
  reconnectToken: string;
}
