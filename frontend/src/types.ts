// Type-only: the backend file is the single source of truth for the wire format.
export type {
  ActivityFeedEvent,
  AdminAction,
  MatchPlayer,
  MatchRound,
  Move,
  PhaseBracketSnapshot,
  PlayerRef,
  PublicLobby as Lobby,
  PublicPlayer as Player,
  RoomSettings,
  SafeMatch,
  SessionReady as SessionState,
  Tournament,
  TournamentPhase,
  TournamentSnapshot
} from "../../backend/src/tournament/tournament.types";
