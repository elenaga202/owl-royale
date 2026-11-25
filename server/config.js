const ARENA = { w: 800, h: 496 };
const GAME_MS = 90000;
const TICK_MS = 50;
const TEAM_CONFIG = [
  { id: "owl-1", name: "Búho amarillo", color: "#F4C542", spawnX: 200, spawnY: 128 },
  { id: "owl-2", name: "Búho azul", color: "#58A6E7", spawnX: 600, spawnY: 128 },
  { id: "owl-3", name: "Búho verde", color: "#67C587", spawnX: 200, spawnY: 368 },
  { id: "owl-4", name: "Búho morado", color: "#B985E8", spawnX: 600, spawnY: 368 }
];
const AXES = ["vertical", "horizontal"];
const MAX_PILOTS = TEAM_CONFIG.length * 2;

function makeTeams() {
  return TEAM_CONFIG.map(team => ({
    ...team,
    x: team.spawnX,
    y: team.spawnY,
    dx: 0, dy: 0,
    knockbackX: 0, knockbackY: 0,
    slippingUntil: 0,
    slipX: 0, slipY: 0,
    score: 0,
    verticalId: null,
    horizontalId: null
  }));
}

module.exports = { ARENA, GAME_MS, TICK_MS, TEAM_CONFIG, AXES, MAX_PILOTS, makeTeams };
