import { z } from "zod";
import { emitError, emitSnapshot, lobbyRoom, SocketContext, AppSocket } from "./socket.types.js";

const createLobbySchema = z.object({
  name: z.string().min(1).max(18)
});

const joinLobbySchema = z.object({
  name: z.string().min(1).max(18),
  lobbyCode: z.string().min(3).max(8)
});

const spectateSchema = z.object({
  lobbyCode: z.string().min(3).max(8)
});

export function registerLobbyEvents(socket: AppSocket, context: SocketContext) {
  socket.on("lobby:create", (payload) => {
    try {
      const { name } = createLobbySchema.parse(payload);
      const { lobby, player } = context.store.createLobby(socket.id, name);

      socket.join(lobbyRoom(lobby.id));
      socket.emit("session:ready", {
        playerId: player.id,
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        isAdmin: true,
        reconnectToken: player.reconnectToken
      });
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("lobby:join", (payload) => {
    try {
      const { name, lobbyCode } = joinLobbySchema.parse(payload);
      const { lobby, player } = context.store.joinLobby(socket.id, lobbyCode, name);

      socket.join(lobbyRoom(lobby.id));
      socket.emit("session:ready", {
        playerId: player.id,
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        isAdmin: false,
        reconnectToken: player.reconnectToken
      });
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("lobby:joinRandom", (payload) => {
    try {
      const { name } = createLobbySchema.parse(payload);
      const { lobby, player } = context.store.joinRandomLobby(socket.id, name);

      socket.join(lobbyRoom(lobby.id));
      socket.emit("session:ready", {
        playerId: player.id,
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        isAdmin: player.isAdmin,
        reconnectToken: player.reconnectToken
      });
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("lobby:spectate", (payload) => {
    try {
      const { lobbyCode } = spectateSchema.parse(payload);
      const lobby = context.store.findLobbyByCode(lobbyCode);
      if (!lobby) throw new Error("Lobi bulunamadı");
      if (!lobby.overlayEnabled) throw new Error("Yayın overlay'i kapalı");

      context.store.attachSpectator(socket.id, lobby.id);
      socket.join(lobbyRoom(lobby.id));
      socket.emit("tournament:snapshot", context.store.buildSnapshot(lobby.id));
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("lobby:ready", () => {
    try {
      const session = context.store.getSession(socket.id);
      if (!session.lobbyId || !session.playerId) throw new Error("Aktif lobi oturumu yok");

      const lobby = context.store.lobbies.get(session.lobbyId);
      const player = lobby?.players.find((candidate) => candidate.id === session.playerId);
      if (!lobby || !player) throw new Error("Lobi oturumu bulunamadı");
      if (lobby.tournamentId) throw new Error("Turnuva başladı, hazırlık kilitli");

      player.isReady = !player.isReady;
      emitSnapshot(context, lobby.id);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("tournament:snapshot:request", () => {
    try {
      const session = context.store.getSession(socket.id);
      if (!session.lobbyId) throw new Error("Aktif lobi oturumu yok");
      socket.emit("tournament:snapshot", context.store.buildSnapshot(session.lobbyId));
    } catch (error) {
      emitError(socket, error);
    }
  });
}
