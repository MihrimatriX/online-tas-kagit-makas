import { z } from "zod";
import { forfeitPlayer, processMove } from "../tournament/flow.service.js";
import { isValidMove } from "../tournament/match.service.js";
import { createFeedEvent } from "../tournament/live-feed.service.js";
import { handleDisconnect, syncAdminPresence, transferAdmin } from "../tournament/presence.service.js";
import { Lobby, Player, SessionReady } from "../tournament/tournament.types.js";
import {
  AppSocket,
  emitFeed,
  emitSnapshot,
  handle,
  lobbyRoom,
  requirePlayer,
  SocketContext
} from "./socket.types.js";

const nameSchema = z.string().trim().min(1).max(18);
const codeSchema = z.string().trim().min(3).max(8);
const joinSchema = z.object({ name: nameSchema, lobbyCode: codeSchema });
const nameOnlySchema = z.object({ name: nameSchema });
const spectateSchema = z.object({ lobbyCode: codeSchema });
const moveSchema = z.object({ matchId: z.string(), move: z.unknown().refine(isValidMove, "Geçersiz hamle") });
const reconnectSchema = z.object({ lobbyCode: codeSchema, playerId: z.string(), reconnectToken: z.string() });

export function registerPlayerEvents(socket: AppSocket, context: SocketContext) {
  const { store } = context;

  const enter = (lobby: Lobby, player: Player) => {
    socket.join(lobbyRoom(lobby.id));
    const ready: SessionReady = {
      playerId: player.id,
      lobbyId: lobby.id,
      lobbyCode: lobby.code,
      reconnectToken: player.reconnectToken ?? ""
    };
    socket.emit("session:ready", ready);
    emitSnapshot(context, lobby.id);
  };

  // A double-clicked "create" must not leave an orphan lobby behind with this socket inside.
  const assertNotInLobby = () => {
    if (store.getSession(socket.id).playerId) throw new Error("Zaten bir lobidesin");
  };

  handle(socket, "lobby:create", (payload) => {
    const { name } = nameOnlySchema.parse(payload);
    assertNotInLobby();
    const { lobby, player } = store.createLobby(socket.id, name);
    enter(lobby, player);
  });

  handle(socket, "lobby:join", (payload) => {
    const { name, lobbyCode } = joinSchema.parse(payload);
    assertNotInLobby();
    const { lobby, player } = store.joinLobby(socket.id, lobbyCode, name);
    emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${player.name} lobiye katıldı.`));
    enter(lobby, player);
  });

  handle(socket, "lobby:joinRandom", (payload) => {
    const { name } = nameOnlySchema.parse(payload);
    assertNotInLobby();
    const { lobby, player } = store.joinRandomLobby(socket.id, name);
    enter(lobby, player);
  });

  handle(socket, "lobby:spectate", (payload) => {
    const { lobbyCode } = spectateSchema.parse(payload);
    const lobby = store.findLobbyByCode(lobbyCode);
    if (!lobby) throw new Error("Bu kodla bir lobi yok");
    if (!lobby.overlayEnabled) throw new Error("Bu lobinin yayın ekranı kapalı");
    store.attachSpectator(socket.id, lobby.id);
    socket.join(lobbyRoom(lobby.id));
    socket.emit("tournament:snapshot", store.buildSnapshot(lobby.id));
  });

  handle(socket, "lobby:ready", () => {
    const { lobby, player } = requirePlayer(socket, context);
    if (lobby.tournamentId) throw new Error("Eşleşmeler çekildi, hazır durumu kilitli");
    player.isReady = !player.isReady;
    emitSnapshot(context, lobby.id);
  });

  handle(socket, "lobby:leave", () => {
    const { session, lobby, player } = requirePlayer(socket, context);
    const wasAdmin = player.id === lobby.adminPlayerId;

    store.removePlayer(lobby.id, player.id);
    forfeitPlayer(context, lobby, player.id, "left");
    session.lobbyId = null;
    session.playerId = null;
    socket.leave(lobbyRoom(lobby.id));
    socket.emit("session:left");
    emitFeed(context, createFeedEvent(lobby.id, "admin_action", `${player.name} lobiden ayrıldı.`));

    if (!lobby.tournamentId) store.compactWaitingLobby(lobby.id);
    else if (wasAdmin) transferAdmin(context, lobby.id);
    if (store.lobbies.has(lobby.id)) emitSnapshot(context, lobby.id);
  });

  handle(socket, "match:move", (payload) => {
    const { matchId, move } = moveSchema.parse(payload);
    const { player } = requirePlayer(socket, context);
    processMove(context, matchId, player.id, move);
    socket.emit("match:moveAccepted", { matchId, move });
  });

  handle(socket, "session:reconnect", (payload) => {
    const parsed = reconnectSchema.safeParse(payload);
    const validated = parsed.success
      ? store.validateReconnect(parsed.data.lobbyCode, parsed.data.playerId, parsed.data.reconnectToken)
      : null;
    if (!validated) {
      socket.emit("session:invalid");
      return;
    }

    const { lobby, player } = validated;
    if (player.socketId && player.socketId !== socket.id) {
      const previous = context.io.sockets.sockets.get(player.socketId);
      previous?.emit("app:error", { message: "Bu oturum başka bir sekmede açıldı" });
      previous?.disconnect(true);
    }
    store.attachSession(socket.id, lobby.id, player.id);
    syncAdminPresence(context, lobby.id);
    enter(lobby, player);
  });

  socket.on("disconnect", () => handleDisconnect(context, socket.id));
}
