/**
 * ponytail: no test framework — one runnable check that fails if core invariants break.
 * Run: npm run self-check
 */
process.env.PERSIST = "0";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Server } from "socket.io";
import { injectSeo, resolvePublicOrigin, seoForRequest } from "./seo.js";
import type { SocketContext } from "./socket/socket.types.js";
import { MemoryStore } from "./state/memory-store.js";
import { hydrateStore, serializeStore } from "./state/persist.js";
import { buildTournamentPhases, createInitialPhaseMatches, getBracketSize, nowIso } from "./tournament/bracket.service.js";
import {
  advanceTournament,
  assignMatchWinner,
  forfeitPlayer,
  pauseTournament,
  processMove,
  resetForNewTournament,
  restartMatch,
  resumeTournament,
  seedTournament,
  startTournament,
  unseedTournament
} from "./tournament/flow.service.js";
import { registerMove, startMatch } from "./tournament/match.service.js";
import { getCurrentPhase, getPhaseMatches } from "./tournament/phase.service.js";
import { IDLE_LOBBY_MS, sweepIdleLobbies } from "./tournament/presence.service.js";
import { clearAllTimers } from "./tournament/timer.service.js";
import type { Lobby, Match, Player, Tournament } from "./tournament/tournament.types.js";

function fakeContext(): SocketContext {
  const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } } as unknown as Server;
  return { io, store: new MemoryStore() };
}

function lobbyWith(context: SocketContext, count: number) {
  const { lobby } = context.store.createLobby("s0", "P0");
  for (let i = 1; i < count; i += 1) context.store.joinLobby(`s${i}`, lobby.code, `P${i}`);
  lobby.players.forEach((player) => (player.isReady = true));
  lobby.settings.countdownSeconds = 0;
  return lobby;
}

function phaseMatches(context: SocketContext, tournament: Tournament) {
  return getPhaseMatches(getCurrentPhase(tournament), context.store.matches);
}

/** Plays rounds where player1 always wins until the match is over. */
function playOut(context: SocketContext, match: Match) {
  while (match.status === "playing") {
    match.countdownEndsAt = null; // skip the reveal pause between rounds
    processMove(context, match.id, match.player1.id, "rock");
    processMove(context, match.id, match.player2.id, "scissors");
  }
}

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

function checkJoinRules() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Admin");
  assert.throws(() => store.joinLobby("s2", lobby.code, "admin"), /isim/);
  for (let i = 0; i < 63; i += 1) store.joinLobby(`x${i}`, lobby.code, `P${i}`);
  assert.equal(lobby.players.length, 64);
  assert.throws(() => store.joinLobby("overflow", lobby.code, "Nope"), /dolu/);
}

function checkByePairing() {
  for (let count = 2; count <= 64; count += 1) {
    const size = getBracketSize(count);
    const matches = createInitialPhaseMatches(fakePlayers(count), buildTournamentPhases(size)[0], "t");
    assert.equal(matches.length, size / 2);
    for (const match of matches) {
      assert.ok(!(match.player1.isBye && match.player2.isBye), `BYE-BYE at ${count}`);
      if (match.isBye) assert.ok(match.winner && !match.winner.isBye && match.status === "finished");
    }
  }
}

function checkRpsRules() {
  const match = createInitialPhaseMatches(fakePlayers(2), buildTournamentPhases(2)[0], "t")[0];
  startMatch(match);
  registerMove(match, match.player1.id, "rock", 2);
  assert.throws(() => registerMove(match, match.player1.id, "paper", 2), /kilitli/);
  registerMove(match, match.player2.id, "scissors", 2);
  assert.equal(match.rounds[0].winner, match.player1.id);
  registerMove(match, match.player1.id, "paper", 2);
  registerMove(match, match.player2.id, "paper", 2);
  assert.equal(match.rounds[1].winner, null);
  registerMove(match, match.player1.id, "scissors", 2);
  registerMove(match, match.player2.id, "paper", 2);
  assert.equal(match.status, "finished");
  assert.equal(match.winner?.id, match.player1.id);
}

function checkFullTournament() {
  const context = fakeContext();
  const lobby = lobbyWith(context, 4);
  const tournament = seedTournament(context, lobby);
  assert.throws(() => context.store.joinLobby("late", lobby.code, "Late"), /başladı/, "no joins once paired");

  startTournament(context, lobby, tournament);
  const semis = phaseMatches(context, tournament);
  assert.ok(semis.every((match) => match.status === "playing"));

  // Old bug: results decided during a pause never completed the phase.
  pauseTournament(context, lobby, tournament);
  semis.forEach((match) => assignMatchWinner(context, lobby, tournament, match.id, match.player2.id));
  assert.equal(getCurrentPhase(tournament).status, "active");
  resumeTournament(context, lobby, tournament);
  assert.equal(getCurrentPhase(tournament).status, "completed");

  // Old bug: changing a result after completion advanced the stale winner.
  assignMatchWinner(context, lobby, tournament, semis[0].id, semis[0].player1.id);
  advanceTournament(context, lobby, tournament);
  const [final] = phaseMatches(context, tournament);
  assert.equal(final.phaseKey, "final");
  assert.equal(final.status, "playing", "advancing starts the next round");
  assert.ok([final.player1.id, final.player2.id].includes(semis[0].player1.id));
  const lostSemi = lobby.players.find((player) => player.id === semis[0].player2.id);
  assert.equal(lostSemi?.isEliminated, true);

  playOut(context, final);
  advanceTournament(context, lobby, tournament);
  assert.equal(tournament.status, "finished");
  assert.equal(lobby.status, "finished");
  assert.equal(tournament.champion?.id, final.player1.id);

  resetForNewTournament(context, lobby, tournament);
  assert.equal(lobby.tournamentId, null);
  assert.equal(lobby.status, "waiting");
  assert.ok(lobby.players.every((player) => !player.isEliminated && player.isReady === Boolean(player.isTest)));
  assert.equal(context.store.matches.size, 0);
}

function checkRestartDuringPause() {
  const context = fakeContext();
  const lobby = lobbyWith(context, 2);
  const tournament = seedTournament(context, lobby);
  startTournament(context, lobby, tournament);
  const [match] = phaseMatches(context, tournament);
  pauseTournament(context, lobby, tournament);
  restartMatch(context, lobby, tournament, match.id);
  assert.equal(match.status, "waiting");
  // Old bug: a match reset during a pause was never started again.
  resumeTournament(context, lobby, tournament);
  assert.equal(match.status, "playing");
}

function checkDepartures() {
  const context = fakeContext();
  const lobby = lobbyWith(context, 4);
  const tournament = seedTournament(context, lobby);
  const [first] = phaseMatches(context, tournament);

  // Kicked while seeded: the opponent advances, and unseeding drops the kicked player.
  context.store.removePlayer(lobby.id, first.player1.id);
  forfeitPlayer(context, lobby, first.player1.id, "kicked");
  assert.equal(first.status, "walkover");
  assert.equal(first.winner?.id, first.player2.id);
  assert.equal(context.store.validateReconnect(lobby.code, first.player1.id, "anything"), null);

  unseedTournament(context, lobby, tournament);
  assert.equal(lobby.players.length, 3);
  assert.equal(context.store.tournaments.size, 0);

  // A semi-final winner who leaves before the final hands the final over.
  const next = seedTournament(context, lobby);
  startTournament(context, lobby, next);
  phaseMatches(context, next)
    .filter((match) => match.status === "playing")
    .forEach((match) => playOut(context, match));
  assert.equal(getCurrentPhase(next).status, "completed");
  const leaver = phaseMatches(context, next).find((match) => !match.isBye)!.winner!;
  context.store.removePlayer(lobby.id, leaver.id);
  advanceTournament(context, lobby, next);
  const [final] = phaseMatches(context, next);
  assert.equal(final.status, "walkover");
  assert.notEqual(final.winner?.id, leaver.id);
  clearAllTimers();
}

function checkSessions() {
  const context = fakeContext();
  const { lobby, player } = context.store.createLobby("old-tab", "Admin");
  context.store.attachSession("new-tab", lobby.id, player.id);
  // Old bug: the stale socket's late disconnect marked a connected player offline.
  context.store.removeSession("old-tab");
  assert.equal(player.connectionStatus, "online");
  context.store.removeSession("new-tab");
  assert.equal(player.connectionStatus, "offline");

  const guest = context.store.joinLobby("g", lobby.code, "Guest").player;
  assert.equal(context.store.promoteAdmin(lobby.id)?.id, guest.id);
  assert.equal(lobby.adminPlayerId, guest.id);

  const snapshot = context.store.buildSnapshot(lobby.id);
  assert.ok(snapshot.lobby.players.every((p) => !("socketId" in p) && !("reconnectToken" in p)));
}

function checkIdleSweep() {
  const context = fakeContext();
  const { lobby } = context.store.createLobby("s", "Gone");
  context.store.removeSession("s");
  sweepIdleLobbies(context, Date.parse(lobby.lastActiveAt) + 1000);
  assert.ok(context.store.lobbies.has(lobby.id), "recently active lobby survives");
  sweepIdleLobbies(context, Date.parse(lobby.lastActiveAt) + IDLE_LOBBY_MS + 1);
  assert.equal(context.store.lobbies.has(lobby.id), false);
  assert.equal(context.store.findLobbyByCode(lobby.code), null);
}

function checkPersistRoundtrip() {
  const store = new MemoryStore();
  const { lobby, player } = store.createLobby("s1", "Admin");
  store.joinLobby("s2", lobby.code, "Guest");
  const payload = serializeStore(store);
  const legacy = payload.lobbies[0] as Partial<Lobby>;
  delete legacy.settings;
  delete legacy.lastActiveAt;
  legacy.name = "";

  const restored = new MemoryStore();
  hydrateStore(restored, payload);
  const found = restored.findLobbyByCode(lobby.code)!;
  assert.equal(found.players.length, 2);
  assert.equal(found.name, "Taş Kağıt Makas");
  assert.equal(found.settings.winningScore, 3);
  assert.ok(found.lastActiveAt);
  assert.ok(found.players.every((p) => p.connectionStatus === "offline" && p.socketId === null));
  assert.equal(found.players.find((p) => p.id === player.id)?.reconnectToken, player.reconnectToken);
}

function checkRoomSettings() {
  const store = new MemoryStore();
  const { lobby } = store.createLobby("s1", "Admin");
  store.updateRoom(lobby.id, { name: "Final Odası", winningScore: 2, moveSeconds: 8, countdownSeconds: 0, autoAdvance: true });
  assert.deepEqual(lobby.settings, { winningScore: 2, moveSeconds: 8, countdownSeconds: 0, autoAdvance: true });
  lobby.tournamentId = "locked";
  assert.throws(() => store.updateRoom(lobby.id, { winningScore: 5 }), /kilit/);
  store.updateRoom(lobby.id, { name: "Yayın", overlayEnabled: false, autoAdvance: false });
  assert.equal(lobby.overlayEnabled, false);
}

function checkSeo() {
  assert.equal(resolvePublicOrigin({ publicOrigin: "https://rps.example/" }), "https://rps.example");
  assert.equal(
    resolvePublicOrigin({ forwardedProto: "https, http", forwardedHost: "play.example.com", host: "localhost:4000" }),
    "https://play.example.com"
  );
  const overlay = seoForRequest({ path: "/overlay/ZZ", code: "ZZ", overlay: true, origin: "https://play.example" });
  assert.equal(overlay.robots, "noindex, nofollow");

  const html = readFileSync(fileURLToPath(new URL("../../frontend/index.html", import.meta.url)), "utf8");
  const hostile = seoForRequest({
    path: "/",
    code: "abc12",
    origin: "https://play.example",
    lobby: { name: '</script><script>alert(1)</script> $1 $&', code: "ABC12", playerCount: 4 }
  });
  const injected = injectSeo(html, hostile);
  assert.equal(injected.includes("<script>alert(1)"), false, "lobby name must not break out of JSON-LD");
  assert.match(injected, /\$1 \$&/, "replacement patterns in user text stay literal");
  assert.match(injected, /href="https:\/\/play.example\/\?code=ABC12"/);
  assert.match(injected, /content="https:\/\/play.example\/og.png"/);
  assert.ok(existsSync(fileURLToPath(new URL("../../frontend/index.html", import.meta.url))));
}

checkJoinRules();
checkByePairing();
checkRpsRules();
checkFullTournament();
checkRestartDuringPause();
checkDepartures();
checkSessions();
checkIdleSweep();
checkPersistRoundtrip();
checkRoomSettings();
checkSeo();
clearAllTimers();
console.log("self-check: ok");
