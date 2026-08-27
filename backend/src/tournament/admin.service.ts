import { AdminAction, Lobby, Tournament } from "./tournament.types.js";
import { createId, nowIso } from "./bracket.service.js";

export function assertAdmin(playerId: string | null, lobby: Lobby) {
  if (!playerId || playerId !== lobby.adminPlayerId) {
    throw new Error("Unauthorized admin action");
  }
}

export function createAdminAction(
  tournament: Tournament,
  adminPlayerId: string,
  actionType: AdminAction["actionType"],
  payload: Record<string, unknown> = {}
): AdminAction {
  return {
    id: createId("admin_action"),
    tournamentId: tournament.id,
    adminPlayerId,
    actionType,
    payload,
    createdAt: nowIso()
  };
}
