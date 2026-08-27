/**
 * ponytail: no test framework — one runnable check that fails if core invariants break.
 * Run: npx tsx src/self-check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "./state/memory-store.js";
import { injectSeo, resolvePublicOrigin, seoForRequest } from "./seo.js";
import { resetMatch, startMatch, registerMove } from "./tournament/match.service.js";
import {
  buildTournamentPhases,
  createInitialPhaseMatches,
  getBracketSize,
  createId,
  nowIso
} from "./tournament/bracket.service.js";
import { canStartPhase, getCurrentPhase, getPhaseMatches } from "./tournament/phase.service.js";
import type { Player, Tournament } from "./tournament/tournament.types.js";
import { serializeStore, hydrateStore } from "./state/persist.js";

function fakePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `P${index}`,
    socketId: null,
    isReady: true,
    isAdmin: index === 0,
    isEliminated: false,
    connectionStatus: "online" as const,
    createdAt: nowIso()
  }));
}

function checkJoinCap() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Admin");
  for (let i = 0; i < 63; i += 1) {
    store.joinLobby(`s${i + 2}`, lobby.code, `P${i}`);
  }
  assert.equal(lobby.players.length, 64);
  assert.throws(() => store.joinLobby("overflow", lobby.code, "Nope"), /64/);
}

function checkUniqueNames() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Ali");
  assert.throws(() => store.joinLobby("s2", lobby.code, "ali"), /isim/);
}

function checkByePairing() {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16]) {
    const players = fakePlayers(count);
    const size = getBracketSize(count);
    const phase = buildTournamentPhases(size)[0];
    const matches = createInitialPhaseMatches(players, phase, "t");
    assert.equal(matches.length, size / 2);
    for (const match of matches) {
      assert.equal(Boolean(match.player1.isBye && match.player2.isBye), false, `BYE-BYE at ${count}`);
      if (match.player1.isBye || match.player2.isBye) {
        assert.equal(match.isBye, true);
        assert.ok(match.winner);
        assert.notEqual(match.winner.isBye, true);
        assert.equal(match.status, "finished");
      }
    }
  }
}

function checkRpsAndMoveLock() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("a", "A");
  store.joinLobby("b", lobby.code, "B");
  const phase = buildTournamentPhases(2)[0];
  const matches = createInitialPhaseMatches(lobby.players, phase, "t");
  const match = matches.find((candidate) => !candidate.isBye)!;
  startMatch(match);
  match.countdownEndsAt = null;
  registerMove(match, match.player1.id, "rock");
  assert.throws(() => registerMove(match, match.player1.id, "paper"), /kilitli/);
  registerMove(match, match.player2.id, "scissors");
  assert.equal(match.player1.score, 1);
  assert.equal(match.rounds[0].winner, match.player1.id);
}

function checkRestartReplayable() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("a", "A");
  store.joinLobby("b", lobby.code, "B");

  const bracketSize = getBracketSize(lobby.players.length);
  const phases = buildTournamentPhases(bracketSize);
  const tournament: Tournament = {
    id: createId("tournament"),
    lobbyId: lobby.id,
    status: "active",
    adminPlayerId: lobby.adminPlayerId,
    currentPhaseIndex: 0,
    currentPhaseKey: phases[0].phaseKey,
    phases,
    champion: null,
    roundAdvanceMode: "hybrid",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const phase = getCurrentPhase(tournament);
  phase.status = "active";
  const matches = createInitialPhaseMatches(lobby.players, phase, tournament.id);
  phase.matchIds = matches.map((m) => m.id);
  matches.forEach((m) => store.matches.set(m.id, m));
  store.tournaments.set(tournament.id, tournament);
  lobby.tournamentId = tournament.id;

  const match = matches.find((m) => !m.isBye)!;
  startMatch(match);
  match.countdownEndsAt = null;
  registerMove(match, match.player1.id, "rock");
  registerMove(match, match.player2.id, "scissors");
  assert.equal(match.player1.score, 1);

  resetMatch(match);
  assert.equal(match.status, "waiting");
  assert.equal(match.countdownEndsAt, null);
  if (tournament.status === "active" && phase.status === "active") {
    startMatch(match);
  }
  assert.equal(match.status, "playing");
  match.countdownEndsAt = null;
  registerMove(match, match.player1.id, "paper");
  assert.ok(match.pendingMoves[match.player1.id]);
}

function checkReconnectToken() {
  const store = new MemoryStore();
  const { lobby, player } = store.createLobby("s1", "Admin");
  assert.ok(player.reconnectToken);
  assert.equal(store.validateReconnect(lobby.code, player.id, "wrong"), null);
  const ok = store.validateReconnect(lobby.code, player.id, player.reconnectToken);
  assert.equal(ok?.player.id, player.id);
}

function checkPersistRoundtrip() {
  const store = new MemoryStore();
  const { lobby, player } = store.createLobby("s1", "Admin");
  store.joinLobby("s2", lobby.code, "Guest");
  const payload = serializeStore(store);
  const restored = new MemoryStore();
  hydrateStore(restored, payload);
  const found = restored.findLobbyByCode(lobby.code);
  assert.ok(found);
  assert.equal(found!.players.length, 2);
  assert.equal(found!.overlayEnabled, true);
  assert.equal(found!.settings.winningScore, 3);
  assert.ok(found!.players.every((p) => p.connectionStatus === "offline" && p.socketId === null));
  assert.equal(found!.players.find((p) => p.id === player.id)?.reconnectToken, player.reconnectToken);
}

function checkPhaseStartGate() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("a", "A");
  store.joinLobby("b", lobby.code, "B");
  const phases = buildTournamentPhases(2);
  const tournament: Tournament = {
    id: createId("t"),
    lobbyId: lobby.id,
    status: "active",
    adminPlayerId: lobby.adminPlayerId,
    currentPhaseIndex: 0,
    currentPhaseKey: phases[0].phaseKey,
    phases,
    champion: null,
    roundAdvanceMode: "hybrid",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const phase = getCurrentPhase(tournament);
  const matches = createInitialPhaseMatches(lobby.players, phase, tournament.id);
  phase.matchIds = matches.map((m) => m.id);
  assert.equal(canStartPhase(tournament, phase), true);
  assert.equal(getPhaseMatches(phase, new Map(matches.map((m) => [m.id, m]))).length, 1);
}

function checkRoomSettings() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Admin");
  assert.equal(lobby.name, "Taş Kağıt Makas");
  assert.equal(lobby.settings.winningScore, 3);
  store.updateRoom(lobby.id, {
    name: "Final Odası",
    winningScore: 2,
    moveSeconds: 8,
    countdownSeconds: 0,
    autoAdvance: true
  });
  assert.equal(lobby.name, "Final Odası");
  assert.deepEqual(lobby.settings, {
    winningScore: 2,
    moveSeconds: 8,
    countdownSeconds: 0,
    autoAdvance: true
  });

  lobby.tournamentId = "locked";
  assert.throws(() => store.updateRoom(lobby.id, { winningScore: 5 }), /kilit/);
  store.updateRoom(lobby.id, { name: "Yayın", overlayEnabled: false, autoAdvance: false });
  assert.equal(lobby.name, "Yayın");
  assert.equal(lobby.overlayEnabled, false);
  assert.equal(lobby.settings.winningScore, 2);

  const phase = buildTournamentPhases(2)[0];
  const matches = createInitialPhaseMatches(fakePlayers(2), phase, "t");
  const match = matches.find((candidate) => !candidate.isBye)!;
  startMatch(match);
  match.countdownEndsAt = null;
  registerMove(match, match.player1.id, "rock", 2);
  registerMove(match, match.player2.id, "scissors", 2);
  assert.equal(match.player1.score, 1);
  assert.equal(match.status, "playing");
  registerMove(match, match.player1.id, "rock", 2);
  registerMove(match, match.player2.id, "scissors", 2);
  assert.equal(match.player1.score, 2);
  assert.equal(match.status, "finished");
}

function checkPersistDefaults() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Admin");
  const payload = serializeStore(store);
  const raw = payload.lobbies[0] as { settings?: unknown; name?: string };
  delete raw.settings;
  raw.name = "";
  const restored = new MemoryStore();
  hydrateStore(restored, payload);
  const found = restored.findLobbyByCode(lobby.code);
  assert.equal(found?.name, "Taş Kağıt Makas");
  assert.equal(found?.settings.winningScore, 3);
}

function checkAdminPromote() {
  const store = new MemoryStore();
  const { lobby, player } = store.createLobby("s1", "Admin");
  const guest = store.joinLobby("s2", lobby.code, "Guest");
  player.connectionStatus = "offline";
  player.socketId = null;
  const next = store.promoteAdmin(lobby.id);
  assert.equal(next?.id, guest.player.id);
  assert.equal(lobby.adminPlayerId, guest.player.id);
}

checkJoinCap();
checkUniqueNames();
checkByePairing();
checkRpsAndMoveLock();
checkReconnectToken();
checkRestartReplayable();
checkPersistRoundtrip();
checkPhaseStartGate();
checkAdminPromote();
checkRoomSettings();
checkPersistDefaults();
checkSeo();
console.log("self-check: ok");

function checkSeo() {
  assert.equal(resolvePublicOrigin({ publicOrigin: "https://rps.example/" }), "https://rps.example");
  assert.equal(
    resolvePublicOrigin({
      forwardedProto: "https, http",
      forwardedHost: "play.example.com",
      protocol: "http",
      host: "localhost:4000"
    }),
    "https://play.example.com"
  );

  const home = seoForRequest({ path: "/", origin: "https://play.example" });
  assert.equal(home.image, "https://play.example/og.png");
  assert.equal(home.url, "https://play.example/");
  assert.equal(home.robots, "index, follow");

  const join = seoForRequest({
    path: "/",
    code: "abc12",
    origin: "https://play.example",
    lobby: { name: 'Final "Oda"', code: "ABC12", playerCount: 4 }
  });
  assert.equal(join.url, "https://play.example/?code=ABC12");
  assert.match(join.title, /Final "Oda"/);
  assert.match(join.description, /4 oyuncu/);

  const overlay = seoForRequest({
    path: "/overlay/ZZ",
    code: "ZZ",
    overlay: true,
    origin: "https://play.example"
  });
  assert.equal(overlay.robots, "noindex, nofollow");
  assert.equal(overlay.url, "https://play.example/overlay/ZZ");

  const indexPath = fileURLToPath(new URL("../../frontend/index.html", import.meta.url));
  assert.equal(existsSync(indexPath), true);
  const injected = injectSeo(readFileSync(indexPath, "utf8"), join);
  assert.match(injected, /<title data-seo="title">Final "Oda" · ABC12 — RPS Arena<\/title>/);
  assert.match(injected, /content="Final &quot;Oda&quot; · ABC12 — RPS Arena"/);
  assert.match(injected, /content="https:\/\/play.example\/og.png"/);
  assert.match(injected, /href="https:\/\/play.example\/\?code=ABC12"/);
  assert.match(injected, /"@type":"WebApplication"/);
}
