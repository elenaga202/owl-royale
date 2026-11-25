const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true, game: "OWL ROYALE" }));

const rooms = new Map();
const { ARENA, GAME_MS, TICK_MS, AXES, MAX_PILOTS, makeTeams } = require("./server/config");
const { ITEM_TYPES, spawnItem, getItemSpawnDelay } = require("./server/items");
const { stepPhysics, INPUT_SPEED } = require("./server/physics");

const POKEBALL_INTERVAL_MIN = 1000;
const POKEBALL_INTERVAL_MAX = 5000;
const POKEBALL_START_DELAY_MS = 0;
const POKEBALL_INITIAL_INTERVAL_MULTIPLIER = 2;
const POKEBALL_WARNING_MS = 2000;
const POKEBALL_CAPTURE_MS = 3000;
const POKEBALL_MAX_ACTIVE = 5;
const POKEBALL_HIT_RADIUS = 56;
const ITEM_MAX_ACTIVE = 5;
const INK_TRAP_SPAWN_MIN_MS = 12000;
const INK_TRAP_SPAWN_MAX_MS = 18000;
const INK_TRAP_LIFETIME_MS = 8000;
const INK_TRAP_SLIP_MS = 1500;
const INK_TRAP_SLIP_SPEED = 120;
const INK_TRAP_MAX_ACTIVE = 3;
const INK_TRAP_HIT_RADIUS = 56;

function code() { return crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase(); }
function createRoomState(roomCode, hostId) {
  return {
    code: roomCode, hostId, phase: "lobby", players: new Map(), teams: makeTeams(),
    items: [], itemSpawnAt: {}, traps: [], trapSpawnAt: 0, ranking: [], endsAt: 0,
    collisionCooldowns: new Map(), collisions: [], lastTickAt: Date.now()
  };
}

function createDeveloperRoom(socket, mode) {
  leaveRoom(socket);
  let roomCode;
  do { roomCode = code(); } while (rooms.has(roomCode));

  const isPlayer = mode === "player";
  const room = createRoomState(roomCode, isPlayer ? socket.id : null);
  room.developer = true;
  room.devOwnerId = socket.id;

  if (isPlayer) {
    const team = room.teams[0];
    team.verticalId = socket.id;
    room.players.set(socket.id, {
      id: socket.id, name: "Piloto de prueba", teamId: team.id, axis: "vertical", ready: true
    });
  }

  room.teams.forEach((team, teamIndex) => {
    for (const axis of AXES) {
      const key = axis === "vertical" ? "verticalId" : "horizontalId";
      if (team[key]) continue;
      const id = `developer-${team.id}-${axis}`;
      team[key] = id;
      room.players.set(id, {
        id, name: `Piloto ${teamIndex + 1} ${axis === "vertical" ? "vertical" : "horizontal"}`,
        teamId: team.id, axis, ready: true
      });
    }
  });

  rooms.set(roomCode, room);
  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  socket.data.isDisplay = !isPlayer;
  room.loop = setInterval(() => tick(room), TICK_MS);

  const player = isPlayer ? room.players.get(socket.id) : null;
  return {
    room,
    response: {
      ok: true, code: roomCode,
      playerId: player?.id || null, teamId: player?.teamId || null, axis: player?.axis || null
    }
  };
}

function publicRoom(room) {
  return {
    code: room.code, phase: room.phase, hostId: room.hostId,
    teams: room.teams.map(t => ({ id: t.id, name: t.name, color: t.color,
      pilots: {
        vertical: room.players.get(t.verticalId) ? { id: t.verticalId, name: room.players.get(t.verticalId).name, ready: room.players.get(t.verticalId).ready } : null,
        horizontal: room.players.get(t.horizontalId) ? { id: t.horizontalId, name: room.players.get(t.horizontalId).name, ready: room.players.get(t.horizontalId).ready } : null
      }
    })),
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, ready: p.ready, teamId: p.teamId,
      teamName: room.teams.find(t => t.id === p.teamId)?.name,
      color: room.teams.find(t => t.id === p.teamId)?.color,
      axis: p.axis,
      score: room.teams.find(t => t.id === p.teamId)?.score || 0
    })),
    timeLeft: room.phase === "playing" ? Math.max(0, room.endsAt - Date.now()) : GAME_MS
  };
}
function emitRoom(room) { io.to(room.code).emit("room:update", publicRoom(room)); }
function assignSeat(room, socketId, name) {
  for (const team of room.teams) {
    for (const axis of AXES) {
      const key = axis === "vertical" ? "verticalId" : "horizontalId";
      if (!team[key]) {
        team[key] = socketId;
        const player = { id: socketId, name: String(name || "Piloto").trim().slice(0, 16) || "Piloto", teamId: team.id, axis, ready: false };
        room.players.set(socketId, player);
        return player;
      }
    }
  }
  return null;
}
function schedulePokeball(room, now) {
  const elapsed = now - room.startedAt;
  const progress = Math.min(1, Math.max(0, elapsed / GAME_MS));
  const intervalMultiplier = POKEBALL_INITIAL_INTERVAL_MULTIPLIER -
    (POKEBALL_INITIAL_INTERVAL_MULTIPLIER - 1) * progress;
  const delay = (POKEBALL_INTERVAL_MIN +
    Math.random() * (POKEBALL_INTERVAL_MAX - POKEBALL_INTERVAL_MIN)) * intervalMultiplier;

  room.nextPokeballAt = now + delay;
}

function spawnPokeball(room, now) {
  if (room.pokeballs.length >= POKEBALL_MAX_ACTIVE) return;

  room.pokeballs.push({
    id: crypto.randomUUID(),
    x: 60 + Math.random() * (ARENA.w - 120),
    y: 60 + Math.random() * (ARENA.h - 120),
    phase: "warning",
    spawnedAt: now,
    impactAt: now + POKEBALL_WARNING_MS,
    capturedTeamId: null,
    releaseAt: null
  });
}

function spawnInkTrap(now) {
  return {
    id: crypto.randomUUID(),
    x: 40 + Math.random() * (ARENA.w - 80),
    y: 40 + Math.random() * (ARENA.h - 80),
    expiresAt: now + INK_TRAP_LIFETIME_MS
  };
}

function updateInkTraps(room, now) {
  if (now >= room.trapSpawnAt) {
    if (room.traps.length < INK_TRAP_MAX_ACTIVE) {
      room.traps.push(spawnInkTrap(now));
    }
    room.trapSpawnAt = now + INK_TRAP_SPAWN_MIN_MS +
      Math.random() * (INK_TRAP_SPAWN_MAX_MS - INK_TRAP_SPAWN_MIN_MS);
  }

  for (let i = room.traps.length - 1; i >= 0; i--) {
    const trap = room.traps[i];
    if (now >= trap.expiresAt) {
      room.traps.splice(i, 1);
      continue;
    }

    const team = room.teams.find(candidate =>
      (!candidate.capturedUntil || now >= candidate.capturedUntil) &&
      (!candidate.slippingUntil || now >= candidate.slippingUntil) &&
      Math.hypot(candidate.x - trap.x, candidate.y - trap.y) < INK_TRAP_HIT_RADIUS
    );
    if (!team) continue;

    let slipX = team.dx * INPUT_SPEED + (team.knockbackX || 0);
    let slipY = team.dy * INPUT_SPEED + (team.knockbackY || 0);
    const speed = Math.hypot(slipX, slipY);
    if (speed < 1) {
      const direction = Math.random() * Math.PI * 2;
      slipX = Math.cos(direction);
      slipY = Math.sin(direction);
    } else {
      slipX /= speed;
      slipY /= speed;
    }

    team.slippingUntil = now + INK_TRAP_SLIP_MS;
    team.slipX = slipX * INK_TRAP_SLIP_SPEED;
    team.slipY = slipY * INK_TRAP_SLIP_SPEED;
    team.knockbackX = 0;
    team.knockbackY = 0;
    room.traps.splice(i, 1);
  }
}

function updatePokeballs(room, now) {
  if (now >= room.nextPokeballAt) {
    spawnPokeball(room, now);
    schedulePokeball(room, now);
  }

  for (let i = room.pokeballs.length - 1; i >= 0; i--) {
    const ball = room.pokeballs[i];

    if (ball.phase === "warning" && now >= ball.impactAt) {
      const target = room.teams.find(team =>
        (!team.capturedUntil || now >= team.capturedUntil) &&
        Math.hypot(team.x - ball.x, team.y - ball.y) < POKEBALL_HIT_RADIUS
      );

      if (target) {
        target.capturedUntil = now + POKEBALL_CAPTURE_MS;
        target.dx = 0;
        target.dy = 0;
        target.knockbackX = 0;
        target.knockbackY = 0;
        target.slippingUntil = 0;
        target.slipX = 0;
        target.slipY = 0;

        ball.phase = "captured";
        ball.capturedTeamId = target.id;
        ball.releaseAt = target.capturedUntil;
      } else {
        room.pokeballs.splice(i, 1);
      }
    }

    if (ball.phase === "captured" && now >= ball.releaseAt) {
      room.pokeballs.splice(i, 1);
    }
  }
}
function startGame(room) {
  room.teams = room.teams.filter(team => team.verticalId && team.horizontalId);
  room.phase = "playing";
  room.startedAt = Date.now();
  room.endsAt = room.startedAt + GAME_MS;
  room.lastTickAt = room.startedAt;
  room.collisionCooldowns.clear();
  room.collisions = [];
  room.pokeballs = [];
  room.nextPokeballAt = room.startedAt + POKEBALL_START_DELAY_MS;
  room.items = [];
  room.traps = [];
  room.trapSpawnAt = room.startedAt + INK_TRAP_SPAWN_MIN_MS +
    Math.random() * (INK_TRAP_SPAWN_MAX_MS - INK_TRAP_SPAWN_MIN_MS);
  room.itemSpawnAt = Object.fromEntries(ITEM_TYPES.map(item => [
    item.type,
    room.startedAt + getItemSpawnDelay(item.type)
  ]));
  room.teams.forEach(team => {
    team.score = 0;
    team.x = team.spawnX;
    team.y = team.spawnY;
    team.dx = 0; team.dy = 0; team.knockbackX = 0; team.knockbackY = 0;
    team.slippingUntil = 0; team.slipX = 0; team.slipY = 0;
  });
  emitRoom(room);
  io.to(room.code).emit("game:started", { duration: GAME_MS });
}
function finishGame(room) {
  room.phase = "results";
  room.items = [];
  room.itemSpawnAt = {};
  room.traps = [];
  room.trapSpawnAt = 0;
  room.pokeballs = [];
  const ranking = [...room.teams].sort((a, b) => b.score - a.score).map((t, i) => ({
    rank: i + 1, name: t.name, color: t.color, score: t.score,
    pilots: [room.players.get(t.verticalId)?.name, room.players.get(t.horizontalId)?.name].filter(Boolean)
  }));
  room.ranking = ranking;
  io.to(room.code).emit("game:finished", { ranking });
  emitRoom(room);
}
function leaveRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  socket.data.roomCode = null;
  if (!room) return;
  if (room.developer && room.devOwnerId === socket.id) {
    clearInterval(room.loop);
    rooms.delete(roomCode);
    return;
  }
  const player = room.players.get(socket.id);
  if (player) {
    const team = room.teams.find(t => t.id === player.teamId);
    if (team) {
      if (player.axis === "vertical") { team.verticalId = null; team.dy = 0; }
      else { team.horizontalId = null; team.dx = 0; }
    }
    room.players.delete(socket.id);
  }
  if (room.players.size === 0) {
    clearInterval(room.loop); rooms.delete(roomCode); return;
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value || null;
  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name, mode } = {}, cb = () => {}) => {
    leaveRoom(socket);
    let roomCode;
    do { roomCode = code(); } while (rooms.has(roomCode));
    const room = createRoomState(roomCode, socket.id);
    rooms.set(roomCode, room);
    socket.join(roomCode); socket.data.roomCode = roomCode; socket.data.isDisplay = mode === "viewer";
    const player = mode === "viewer" ? null : assignSeat(room, socket.id, name || "Anfitrión");
    if (player) player.ready = true;
    room.loop = setInterval(() => tick(room), TICK_MS);
    cb({
      ok: true, code: roomCode, hostId: socket.id,
      playerId: player?.id || null, teamId: player?.teamId || null, axis: player?.axis || null
    });
    emitRoom(room);
  });

  socket.on("developer:start", ({ mode } = {}, cb = () => {}) => {
    if (mode !== "player" && mode !== "viewer") {
      return cb({ ok: false, error: "Modo developer no válido." });
    }
    const developerRoom = createDeveloperRoom(socket, mode);
    cb(developerRoom.response);
    startGame(developerRoom.room);
  });

  socket.on("display:watch", ({ code: rawCode } = {}, cb = () => {}) => {
    leaveRoom(socket);
    const room = rooms.get(String(rawCode || "").toUpperCase());
    if (!room) return cb({ ok: false, error: "No encontramos esa sala." });
    socket.join(room.code); socket.data.roomCode = room.code; socket.data.isDisplay = true;
    cb({ ok: true, code: room.code }); emitRoom(room);
    if (room.phase === "playing") socket.emit("game:started", { duration: Math.max(0, room.endsAt - Date.now()) });
    if (room.phase === "results") socket.emit("game:finished", { ranking: room.ranking || [] });
  });

  socket.on("room:join", ({ code: rawCode, name } = {}, cb = () => {}) => {
    leaveRoom(socket);
    const room = rooms.get(String(rawCode || "").toUpperCase());
    if (!room) return cb({ ok: false, error: "No encontramos esa sala." });
    if (room.phase !== "lobby") return cb({ ok: false, error: "La partida ya ha comenzado." });
    if (room.players.size >= MAX_PILOTS) return cb({ ok: false, error: `La sala está completa (${MAX_PILOTS} pilotos).` });
    const player = assignSeat(room, socket.id, name);
    if (!player) return cb({ ok: false, error: "No quedan plazas disponibles." });
    socket.join(room.code); socket.data.roomCode = room.code; socket.data.isDisplay = false;
    cb({ ok: true, code: room.code, playerId: socket.id, teamId: player.teamId, axis: player.axis });
    emitRoom(room);
  });

  socket.on("player:ready", () => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players.get(socket.id);
    if (!p || room.phase !== "lobby") return;
    p.ready = !p.ready; emitRoom(room);
  });

  socket.on("game:start", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== "lobby") return;
    const completeTeams = room.teams.filter(team => team.verticalId && team.horizontalId);
    if (completeTeams.length === 0 || room.players.size !== completeTeams.length * 2) {
      return socket.emit("room:error", "Solo se puede iniciar con parejas completas: dos pilotos por cada búho presente.");
    }
    if ([...room.players.values()].some(p => !p.ready)) {
      return socket.emit("room:error", "Todavía hay pilotos que no están listos.");
    }
    startGame(room);
  });

  socket.on("player:input", input => {
    const room = rooms.get(socket.data.roomCode);
    const p = room?.players.get(socket.id);
    if (!p || room.phase !== "playing") return;
    const team = room.teams.find(t => t.id === p.teamId);
    if (!team) return;
    const value = Math.max(-1, Math.min(1, Number(p.axis === "vertical" ? input?.y : input?.x) || 0));
    if (p.axis === "vertical") team.dy = value;
    else team.dx = value;
  });

  socket.on("disconnect", () => leaveRoom(socket));
});

function tick(room) {
  if (room.phase !== "playing") return;
  const now = Date.now();
  if (now >= room.endsAt) return finishGame(room);
  const dtSeconds = Math.min(0.1, Math.max(0.01, (now - (room.lastTickAt || now - TICK_MS)) / 1000));
  room.lastTickAt = now;
  updateInkTraps(room, now);
  stepPhysics(room, now, dtSeconds);
  updatePokeballs(room, now);

  for (const itemType of ITEM_TYPES) {
    if (now >= room.itemSpawnAt[itemType.type]) {
      if (room.items.length < ITEM_MAX_ACTIVE) {
        room.items.push(spawnItem(itemType.type, now));
      }
      room.itemSpawnAt[itemType.type] = now + getItemSpawnDelay(itemType.type);
    }
  }

  for (let i = room.items.length - 1; i >= 0; i--) {
    const item = room.items[i];
    if (now >= item.expiresAt) {
      room.items.splice(i, 1);
      continue;
    }
    for (const team of room.teams) {
      if (Math.hypot(team.x - item.x, team.y - item.y) < 42) {
        team.score += item.points;
        room.items.splice(i, 1);
        io.to(room.code).emit("item:collected", { teamId: team.id, itemId: item.id, points: item.points });
        break;
      }
    }
  }
  if (now % 100 < TICK_MS) emitRoom(room);
  io.to(room.code).volatile.emit("game:state", {
    teams: room.teams.map(t => ({ id: t.id, name: t.name, color: t.color, x: t.x, y: t.y, score: t.score,
    capturedUntil: t.capturedUntil || 0, slippingUntil: t.slippingUntil || 0 })),
    items: room.items, traps: room.traps || [], collisions: room.collisions || [], pokeballs: room.pokeballs || [], timeLeft: room.endsAt - now
  });
}

server.listen(PORT, () => console.log(`OWL ROYALE running on http://localhost:${PORT}`));
