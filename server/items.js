const crypto = require("crypto");
const { ARENA } = require("./config");

const ITEM_LIFETIME_MIN_MS = 4000;
const ITEM_LIFETIME_MAX_MS = 6000;
const ITEM_BLINK_MS = 2000;
const ITEM_TYPES = [
  { type: "huevo", points: 1, color: "#6feb9f", icon: "/assets/icons/huevo.png", spawnMinMs: 2000, spawnMaxMs: 4000 },
  { type: "bamba", points: 2, color: "#62A9E8", icon: "/assets/icons/bamba.png", spawnMinMs: 4000, spawnMaxMs: 8000 },
  { type: "tHotel", points: 3, color: "#dad5d5", icon: "/assets/icons/tokioHotel.png", spawnMinMs: 6000, spawnMaxMs: 10000 },
  { type: "txakoli", points: 5, color: "#69B77A", label: "🍾", spawnMinMs: 8000, spawnMaxMs: 12000 },
  { type: "miguel", points: 10, color: "#1b1a1a", icon: "/assets/icons/miguel.png", spawnMinMs: 10000, spawnMaxMs: 15000 }
];

function getItemSpawnDelay(type) {
  const config = ITEM_TYPES.find(item => item.type === type);
  if (!config) throw new Error(`Unknown collectible type: ${type}`);
  return Math.round(config.spawnMinMs + Math.random() * (config.spawnMaxMs - config.spawnMinMs));
}

function spawnItem(type, now = Date.now()) {
  const itemType = ITEM_TYPES.find(item => item.type === type);
  if (!itemType) throw new Error(`Unknown collectible type: ${type}`);
  const lifetime = ITEM_LIFETIME_MIN_MS + Math.random() * (ITEM_LIFETIME_MAX_MS - ITEM_LIFETIME_MIN_MS);
  return {
    id: crypto.randomUUID(),
    x: 35 + Math.random() * (ARENA.w - 70),
    y: 35 + Math.random() * (ARENA.h - 70),
    blinkAt: now + lifetime - ITEM_BLINK_MS,
    expiresAt: now + lifetime,
    type: itemType.type,
    points: itemType.points,
    color: itemType.color,
    label: itemType.label,
    icon: itemType.icon
  };
}

module.exports = { ITEM_TYPES, spawnItem, getItemSpawnDelay };
