const { ARENA } = require("./config");

const OWL_RADIUS = 32;
const COLLISION_DIAMETER = OWL_RADIUS * 2;
const COLLISION_COOLDOWN_MS = 650;
const KNOCKBACK_SPEED = 180; // px/s
const INPUT_SPEED = 76;      // px/s
const SLIP_DECAY = 0.94;

function stepPhysics(room, now, dtSeconds) {
  const dt = Math.min(0.1, Math.max(0, dtSeconds));
  const decay = Math.pow(0.78, dt / 0.05);

  for (const team of room.teams) {
    if (team.capturedUntil && now < team.capturedUntil) {
      team.dx = 0;
      team.dy = 0;
      team.knockbackX = 0;
      team.knockbackY = 0;
      team.slippingUntil = 0;
      team.slipX = 0;
      team.slipY = 0;
      continue;
    }

    team.capturedUntil = 0;

    if (team.slippingUntil && now < team.slippingUntil) {
      team.x += (team.slipX || 0) * dt;
      team.y += (team.slipY || 0) * dt;
      team.slipX = (team.slipX || 0) * Math.pow(SLIP_DECAY, dt / 0.05);
      team.slipY = (team.slipY || 0) * Math.pow(SLIP_DECAY, dt / 0.05);
      team.knockbackX = 0;
      team.knockbackY = 0;
    } else {
      team.slippingUntil = 0;
      team.slipX = 0;
      team.slipY = 0;
      team.x += (team.dx * INPUT_SPEED + (team.knockbackX || 0)) * dt;
      team.y += (team.dy * INPUT_SPEED + (team.knockbackY || 0)) * dt;
      team.knockbackX = (team.knockbackX || 0) * decay;
      team.knockbackY = (team.knockbackY || 0) * decay;
    }

    team.x = Math.max(OWL_RADIUS, Math.min(ARENA.w - OWL_RADIUS, team.x));
    team.y = Math.max(OWL_RADIUS, Math.min(ARENA.h - OWL_RADIUS, team.y));
  }

  const collisions = [];
  for (let i = 0; i < room.teams.length; i++) {
    for (let j = i + 1; j < room.teams.length; j++) {
      const a = room.teams[i], b = room.teams[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= COLLISION_DIAMETER) continue;

      const key = [a.id, b.id].sort().join(":");
      const lastHit = room.collisionCooldowns.get(key) || 0;
      if (now - lastHit < COLLISION_COOLDOWN_MS) continue;

      if (distance < 0.001) {
        // Dirección determinista para el caso excepcional de centros idénticos.
        dx = a.id < b.id ? 1 : -1; dy = 0; distance = 1;
      }
      const nx = dx / distance, ny = dy / distance;
      const overlap = COLLISION_DIAMETER - distance;
      const correction = overlap / 2 + 2;

      a.x -= nx * correction; a.y -= ny * correction;
      b.x += nx * correction; b.y += ny * correction;

      if (!a.slippingUntil || now >= a.slippingUntil) {
        a.knockbackX = (a.knockbackX || 0) - nx * KNOCKBACK_SPEED;
        a.knockbackY = (a.knockbackY || 0) - ny * KNOCKBACK_SPEED;
      }
      if (!b.slippingUntil || now >= b.slippingUntil) {
        b.knockbackX = (b.knockbackX || 0) + nx * KNOCKBACK_SPEED;
        b.knockbackY = (b.knockbackY || 0) + ny * KNOCKBACK_SPEED;
      }

      room.collisionCooldowns.set(key, now);
      collisions.push({
        id: `${key}-${now}`,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        at: now,
        teams: [a.id, b.id]
      });
    }
  }

  // Mantener acotada la memoria de enfriamientos.
  for (const [key, timestamp] of room.collisionCooldowns) {
    if (now - timestamp > 5000) room.collisionCooldowns.delete(key);
  }
  room.collisions = [...(room.collisions || []), ...collisions].filter(hit => now - hit.at < 600);
  return collisions;
}

module.exports = { stepPhysics, OWL_RADIUS, COLLISION_DIAMETER, COLLISION_COOLDOWN_MS, KNOCKBACK_SPEED, INPUT_SPEED };
