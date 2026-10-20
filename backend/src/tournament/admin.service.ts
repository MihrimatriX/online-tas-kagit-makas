import { AdminAction, AdminActionType, Tournament } from "./tournament.types.js";
import { createId, nowIso } from "./bracket.service.js";

export function createAdminAction(
  tournament: Tournament,
  adminPlayerId: string,
  actionType: AdminActionType,
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
