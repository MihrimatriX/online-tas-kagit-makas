import cors from "cors";
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { injectSeo, resolvePublicOrigin, seoForRequest } from "./seo.js";
import { registerAdminEvents } from "./socket/admin.events.js";
import { registerPlayerEvents } from "./socket/player.events.js";
import { SocketContext } from "./socket/socket.types.js";
import { MemoryStore } from "./state/memory-store.js";
import { loadPersistedStore, savePersistedStore } from "./state/persist.js";
import { restoreAfterBoot, sweepIdleLobbies } from "./tournament/presence.service.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const corsOrigin = resolveCorsOrigin();
const __dirname = dirname(fileURLToPath(import.meta.url));
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: corsOrigin }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] },
  maxHttpBufferSize: 16 * 1024
});

const store = new MemoryStore();
try {
  if (loadPersistedStore(store)) console.log(`Loaded persisted state: ${store.lobbies.size} lobbies`);
} catch (error) {
  console.error("Failed to load persisted state, starting empty", error);
}

const context: SocketContext = { io, store };

app.get("/health", (_req, res) => {
  res.json({ ok: true, lobbies: store.lobbies.size });
});

const frontendDist = process.env.FRONTEND_DIST ?? join(__dirname, "../../frontend/dist");
if (process.env.SERVE_FRONTEND === "1" && existsSync(frontendDist)) {
  const indexPath = join(frontendDist, "index.html");
  const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  app.use(express.static(frontendDist, { index: false, maxAge: "1h" }));
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
      .toUpperCase()
      .slice(0, 8);
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
  registerPlayerEvents(socket, context);
  registerAdminEvents(socket, context);
});

httpServer.listen(port, host, () => {
  restoreAfterBoot(context);
  setInterval(() => sweepIdleLobbies(context), SWEEP_INTERVAL_MS).unref();
  console.log(`RPS Arena listening on http://${host}:${port}`);
});

// Docker stop / Ctrl+C: flush the debounced write so a restart loses nothing.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    try {
      savePersistedStore(store);
    } catch (error) {
      console.error("Final persist failed", error);
    }
    process.exit(0);
  });
}

function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.FRONTEND_ORIGIN?.trim();
  if (!raw || raw === "*" || raw === "true") {
    // Same-origin container / LAN access reflects the request Origin; plain dev defaults to Vite.
    if (!raw && process.env.SERVE_FRONTEND !== "1") return "http://localhost:5173";
    return true;
  }
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return raw;
}
