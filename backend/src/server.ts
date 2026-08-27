import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { Server } from "socket.io";
import { MemoryStore } from "./state/memory-store.js";
import { loadPersistedStore, schedulePersist } from "./state/persist.js";
import { registerAdminEvents } from "./socket/admin.events.js";
import { registerLobbyEvents } from "./socket/lobby.events.js";
import { registerMatchEvents, processMove } from "./socket/match.events.js";
import { registerPhaseEvents } from "./socket/phase.events.js";
import { emitSnapshot, lobbyRoom, SocketContext } from "./socket/socket.types.js";
import {
  scheduleDisconnectWalkover,
  cancelDisconnectWalkover,
  scheduleWaitingCompact,
  cancelWaitingCompact,
  scheduleAdminTransfer,
  cancelAdminTransfer
} from "./tournament/disconnect.service.js";
import { joinPlayerToActiveMatches, restorePlayingMatchClocks } from "./tournament/flow.service.js";
import { injectSeo, resolvePublicOrigin, seoForRequest } from "./seo.js";
import { clearAllTimers } from "./tournament/timer.service.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const corsOrigin = resolveCorsOrigin();
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

const store = new MemoryStore();
try {
  if (loadPersistedStore(store)) {
    console.log("Loaded persisted tournament state");
  }
} catch (error) {
  console.error("Failed to load persisted state", error);
}

const context: SocketContext = { io, store };

app.get("/health", (_req, res) => {
  res.json({ ok: true, lobbies: store.lobbies.size });
});

app.get("/api/lobbies/:code/snapshot", (req, res) => {
  const lobby = store.findLobbyByCode(req.params.code);
  if (!lobby) {
    res.status(404).json({ message: "Lobby not found" });
    return;
  }

  res.json(store.buildSnapshot(lobby.id));
});

const frontendDist = process.env.FRONTEND_DIST ?? join(__dirname, "../../frontend/dist");
if (process.env.SERVE_FRONTEND === "1" && existsSync(frontendDist)) {
  const indexPath = join(frontendDist, "index.html");
  const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  app.use(express.static(frontendDist, { index: false }));
  app.get(/.*/, (req, res) => {
    const origin = resolvePublicOrigin({
      publicOrigin: process.env.PUBLIC_ORIGIN,
      forwardedProto: req.get("x-forwarded-proto"),
      forwardedHost: req.get("x-forwarded-host"),
      protocol: req.protocol,
      host: req.get("host")
    });
    const overlayMatch = req.path.match(/^\/overlay\/([^/]+)$/i);
    const code = String(overlayMatch?.[1] ?? req.query.code ?? "")
      .trim()
      .toUpperCase();
    const lobby = code ? store.findLobbyByCode(code) : null;
    const tags = seoForRequest({
      path: req.path,
      code,
      overlay: Boolean(overlayMatch),
      origin,
      lobby: lobby ? { name: lobby.name, code: lobby.code, playerCount: lobby.players.length } : null
    });
    if (overlayMatch) res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-cache");
    res.type("html").send(injectSeo(indexHtml, tags));
  });
}

io.on("connection", (socket) => {
  store.createSession(socket.id);

  registerLobbyEvents(socket, context);
  registerAdminEvents(socket, context);
  registerPhaseEvents(socket, context);
  registerMatchEvents(socket, context);

  socket.on(
    "session:reconnect",
    (payload: { lobbyCode: string; playerId: string; reconnectToken: string }) => {
      try {
        if (!payload?.lobbyCode || !payload?.playerId || !payload?.reconnectToken) return;

        const validated = store.validateReconnect(
          payload.lobbyCode,
          payload.playerId,
          payload.reconnectToken
        );
        if (!validated) {
          socket.emit("app:error", { message: "Reconnect failed" });
          return;
        }

        const { lobby, player } = validated;

        // Kick previous socket if the same player reconnects from another tab
        if (player.socketId && player.socketId !== socket.id) {
          const previous = io.sockets.sockets.get(player.socketId);
          previous?.emit("app:error", { message: "Bu oturum baska bir sekmede acildi" });
          previous?.disconnect(true);
        }

        store.attachSession(socket.id, lobby.id, player.id);
        cancelDisconnectWalkover(lobby.id, player.id);
        cancelWaitingCompact(lobby.id);
        cancelAdminTransfer(lobby.id);
        socket.join(lobbyRoom(lobby.id));
        joinPlayerToActiveMatches(context, lobby.id, player.id, socket.id);

        socket.emit("session:ready", {
          playerId: player.id,
          lobbyId: lobby.id,
          lobbyCode: lobby.code,
          isAdmin: player.id === lobby.adminPlayerId,
          reconnectToken: player.reconnectToken
        });

        emitSnapshot(context, lobby.id);
      } catch {
        socket.emit("app:error", { message: "Reconnect failed" });
      }
    }
  );

  socket.on("disconnect", () => {
    const session = store.removeSession(socket.id);
    if (session?.isSpectator) return;
    if (session?.lobbyId && store.lobbies.has(session.lobbyId)) {
      socket.leave(lobbyRoom(session.lobbyId));

      const lobby = store.lobbies.get(session.lobbyId);
      if (lobby?.status === "waiting" && !lobby.tournamentId) {
        scheduleWaitingCompact(context, session.lobbyId);
      } else if (session.playerId) {
        if (lobby?.tournamentId) {
          const tournament = store.tournaments.get(lobby.tournamentId);
          if (tournament?.status === "active" || tournament?.status === "paused") {
            scheduleDisconnectWalkover(context, session.lobbyId, session.playerId);
          }
        }
        if (lobby && session.playerId === lobby.adminPlayerId) {
          scheduleAdminTransfer(context, session.lobbyId);
        }
      }

      emitSnapshot(context, session.lobbyId);
      schedulePersist(store);
    }
  });
});

httpServer.listen(port, host, () => {
  clearAllTimers();
  restorePlayingMatchClocks(context, processMove);
  console.log(`TMK backend listening on http://${host}:${port}`);
});

function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (!raw || raw === "*" || raw === "true") {
    // Same-origin container / LAN access: reflect request Origin
    if (!raw && process.env.SERVE_FRONTEND !== "1") {
      return "http://localhost:5173";
    }
    return true;
  }
  if (raw.includes(",")) {
    return raw.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return raw;
}
