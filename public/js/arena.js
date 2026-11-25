const canvases = {};
const $ = id => document.getElementById(id);
const captureAnimations = new WeakMap();
const itemImages = new Map();

function getItemImage(src) {
  let image = itemImages.get(src);
  if (!image) {
    image = new Image();
    image.addEventListener("error", () => console.error(`Failed to load item icon: ${src}`), { once: true });
    image.src = src;
    itemImages.set(src, image);
  }
  return image;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
export function renderScoreboard(teams, target) {
  $(target).innerHTML = teams.map(t => `<span class="score-chip"><b style="color:${t.color}">●</b> ${escapeHtml(t.name)} ${t.score}</span>`).join("");
}
export function formatTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `00:${String(s).padStart(2, "0")}`; }
function updateCaptureAnimations(canvas, teams) {
  let entry = captureAnimations.get(canvas);
  if (!entry) {
    const layer = document.createElement("div");
    layer.className = "captured-animation-layer";
    canvas.parentElement.appendChild(layer);
    entry = { layer, images: new Map() };
    captureAnimations.set(canvas, entry);
  }

  const activeTeams = teams.filter(team => team.capturedUntil > Date.now());
  const activeIds = new Set(activeTeams.map(team => team.id));
  for (const [teamId, image] of entry.images) {
    if (!activeIds.has(teamId)) {
      image.remove();
      entry.images.delete(teamId);
    }
  }

  const canvasRect = canvas.getBoundingClientRect();
  const layerRect = entry.layer.getBoundingClientRect();
  const style = window.getComputedStyle(canvas);
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const scaleX = (canvasRect.width - borderLeft - (parseFloat(style.borderRightWidth) || 0)) / canvas.width;
  const scaleY = (canvasRect.height - borderTop - (parseFloat(style.borderBottomWidth) || 0)) / canvas.height;

  for (const team of activeTeams) {
    let image = entry.images.get(team.id);
    if (!image) {
      image = document.createElement("img");
      image.src = "/assets/icons/pokeball_captured.gif";
      image.alt = "";
      image.className = "captured-animation";
      entry.layer.appendChild(image);
      entry.images.set(team.id, image);
    }

    image.style.left = `${canvasRect.left - layerRect.left + borderLeft + team.x * scaleX}px`;
    image.style.top = `${canvasRect.top - layerRect.top + borderTop + team.y * scaleY}px`;
    image.style.width = `${64 * scaleX}px`;
    image.style.height = `${64 * scaleY}px`;
  }
}

export function drawArena(state, canvasId) {
  let entry = canvases[canvasId];
  if (!entry) { const canvas = $(canvasId); if (!canvas) return; entry = canvases[canvasId] = { canvas, ctx: canvas.getContext("2d") }; }
  const { canvas, ctx } = entry, w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (const trap of state.traps || []) {
    if (trap.expiresAt <= Date.now()) continue;
    ctx.beginPath();
    ctx.ellipse(trap.x, trap.y + 3, 22, 15, -0.1, 0, Math.PI * 2);
    ctx.moveTo(trap.x - 15 + 8, trap.y);
    ctx.arc(trap.x - 15, trap.y, 8, 0, Math.PI * 2);
    ctx.moveTo(trap.x + 14 + 9, trap.y + 3);
    ctx.arc(trap.x + 14, trap.y + 3, 9, 0, Math.PI * 2);
    ctx.moveTo(trap.x - 2 + 7, trap.y - 9);
    ctx.arc(trap.x - 2, trap.y - 9, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#17191d";
    ctx.fill();
  }
  for (const item of state.items || []) {
    const remaining = item.expiresAt - Date.now();
    if (remaining <= 0) continue;
    ctx.globalAlpha = Date.now() >= item.blinkAt && Math.floor(Date.now() / 150) % 2 === 0 ? 0.2 : 1;
    ctx.beginPath(); ctx.arc(item.x, item.y, 24, 0, Math.PI * 2); ctx.fillStyle = item.color; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.stroke();
    if (item.icon) {
      const image = getItemImage(item.icon);
      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, item.x - 17, item.y - 17, 34, 34);
      }
    } else {
      ctx.fillStyle = "#fff"; ctx.font = "bold 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(item.label, item.x, item.y + 1);
    }
    ctx.globalAlpha = 1;
  }
  // Poké Balls: aviso y captura.
  for (const ball of state.pokeballs || []) {
    if (ball.phase === "warning") {
      const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 30 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 50, 50, 0.18)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 30 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  for (const team of state.teams || []) {
    ctx.beginPath(); ctx.ellipse(team.x, team.y + 20, 29, 10, 0, 0, Math.PI * 2); ctx.fillStyle = "#26331c33"; ctx.fill();
    ctx.beginPath(); ctx.arc(team.x, team.y, 32, 0, Math.PI * 2); ctx.fillStyle = team.color; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke();
    if (!team.capturedUntil || team.capturedUntil <= Date.now()) {
      ctx.font = "38px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🦉", team.x, team.y + 1);
    }
    ctx.font = "bold 16px Nunito"; ctx.fillStyle = "#29271f"; ctx.fillText(team.name, team.x, team.y - 47);
    if (team.capturedUntil && team.capturedUntil > Date.now()) {
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("💫", team.x, team.y - 72);
    } else if (team.slippingUntil && team.slippingUntil > Date.now()) {
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("💨", team.x, team.y - 68);
    }
  }
  updateCaptureAnimations(canvas, state.teams || []);
  // Anillo y destello breves para visualizar el impacto sincronizado.
  for (const hit of state.collisions || []) {
    const age = Date.now() - hit.at;
    if (age >= 0 && age < 520) {
      const progress = age / 520;
      const radius = 22 + progress * 60;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${1 - progress})`;
      ctx.lineWidth = 8 * (1 - progress) + 1;
      ctx.stroke();
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("💥", hit.x, hit.y - 34 - progress * 15);
    }
  }
}
