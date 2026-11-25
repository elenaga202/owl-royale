import { drawArena, renderScoreboard, formatTime } from "./arena.js";
import { createJoystick } from "./joystick.js";

const socket = window.io();
const $ = id => document.getElementById(id);
const captureIcon = document.createElement("img");
captureIcon.src = "/assets/icons/pokeball_captured.gif";
captureIcon.alt = "";
captureIcon.className = "capture-icon";
const screens = ["home", "lobby", "controller", "display"];
let room = null, myId = null, isHost = false, role = null, currentState = null;
let myTeamId = null, myAxis = null, input = { x: 0, y: 0 }, inputTimer = null, toastTimer = null;
let isCaptured = false;
let fallbackFullscreenTarget = null;
let fullscreenTransition = false;

function showScreen(name) { screens.forEach(s => $(s).classList.toggle("active", s === name)); role = name; }
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600); }
function askName(defaultName = "Piloto") { const value = prompt("¿Cómo te llamas?", defaultName); return value === null ? null : (value || defaultName).trim().slice(0, 16); }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function getFullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || fallbackFullscreenTarget; }
function updateFullscreenButtons() {
  document.querySelectorAll(".fullscreen-btn").forEach(button => {
    const target = button.closest(".arena-wrap, .mobile-arena-wrap");
    const active = !!target && getFullscreenElement() === target;
    button.textContent = active ? "×" : "⛶";
    button.setAttribute("aria-label", active ? "Salir de pantalla completa" : "Activar pantalla completa");
    button.title = active ? "Salir de pantalla completa" : "Pantalla completa";
    button.setAttribute("aria-pressed", String(active));
  });
  document.body.classList.toggle("fullscreen-fallback-active", !!fallbackFullscreenTarget);
}
function setFallbackFullscreen(target) {
  fallbackFullscreenTarget = target;
  target.classList.add("fullscreen-fallback");
  updateFullscreenButtons();
  toast("El navegador no permite pantalla completa nativa; se usa la vista inmersiva.");
}
function clearFallbackFullscreen() {
  if (!fallbackFullscreenTarget) return;
  fallbackFullscreenTarget.classList.remove("fullscreen-fallback");
  fallbackFullscreenTarget = null;
  updateFullscreenButtons();
}
async function toggleFullscreen(button) {
  const target = button.closest(".arena-wrap, .mobile-arena-wrap");
  if (!target || fullscreenTransition) return;
  fullscreenTransition = true;
  try {
    if (fallbackFullscreenTarget === target) {
      clearFallbackFullscreen();
      return;
    }

    const activeElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (activeElement === target) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exitFullscreen) {
        toast("No se pudo salir de la pantalla completa.");
        return;
      }
      try {
        await exitFullscreen.call(document);
      } catch (error) {
        console.error("Failed to exit fullscreen:", error);
        toast("No se pudo salir de la pantalla completa.");
      }
      return;
    }

    if (activeElement) {
      toast("Hay otra pantalla completa activa.");
      return;
    }

    const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
    if (!requestFullscreen) {
      setFallbackFullscreen(target);
      return;
    }
    try {
      await requestFullscreen.call(target);
    } catch (error) {
      console.warn("Native fullscreen unavailable; using immersive mode:", error);
      setFallbackFullscreen(target);
    }
  } finally {
    fullscreenTransition = false;
  }
}
document.querySelectorAll(".fullscreen-btn").forEach(button => {
  button.addEventListener("click", () => toggleFullscreen(button));
});
document.addEventListener("fullscreenchange", updateFullscreenButtons);
document.addEventListener("webkitfullscreenchange", updateFullscreenButtons);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && fallbackFullscreenTarget) clearFallbackFullscreen();
});

function updateRoom(data) {
  currentState = data; room = data.code; isHost = data.hostId === myId;
  $("lobbyCode").textContent = room; $("displayCode").textContent = "SALA " + room;
  $("displayLobbyCode").textContent = room; $("controllerRoom").textContent = "SALA " + room;
  $("startBtn").classList.toggle("hidden", !isHost);
  $("viewerStartBtn").classList.toggle("hidden", !isHost || role !== "display" || data.phase !== "lobby");
  $("lobbyHint").textContent = isHost
    ? "Cada búho que juegue necesita sus dos pilotos listos; no hace falta llenar todos los búhos."
    : "Busca tu compañero de búho; no es necesario llenar los demás equipos.";
  $("playerSlots").innerHTML = ""; $("displayPlayers").innerHTML = "";
  (data.teams || []).forEach(team => {
    const card = document.createElement("div"); card.className = "team-slot-card";
    const pilots = ["vertical", "horizontal"].map(axis => {
      const p = team.pilots?.[axis];
      const axisLabel = axis === "vertical" ? "↕ Vertical" : "↔ Horizontal";
      return `<div class="pilot-slot"><span>${axisLabel}</span><strong>${p ? escapeHtml(p.name) : "Plaza libre"}</strong><small>${p ? (p.ready ? "LISTO" : "PREPARÁNDOSE") : "Esperando piloto"}</small></div>`;
    }).join("");
    card.innerHTML = `<h3><span style="color:${team.color}">●</span> ${escapeHtml(team.name)}</h3><div class="pilot-slots">${pilots}</div>`;
    $("playerSlots").appendChild(card);
    const d = document.createElement("div"); d.className = "display-player";
    d.innerHTML = `<span style="color:${team.color}">●</span> ${escapeHtml(team.name)} · ${team.pilots?.vertical ? "↕ " + escapeHtml(team.pilots.vertical.name) : "↕ —"} · ${team.pilots?.horizontal ? "↔ " + escapeHtml(team.pilots.horizontal.name) : "↔ —"}`;
    $("displayPlayers").appendChild(d);
  });
  const me = (data.players || []).find(p => p.id === myId);
  if (me) {
    myTeamId = me.teamId; myAxis = me.axis;
    $("myName").textContent = me.name; $("myScore").textContent = me.score;
    $("myTeam").textContent = me.teamName;
    $("myRole").textContent = me.axis === "vertical" ? "PILOTO VERTICAL · ↑ ↓" : "PILOTO HORIZONTAL · ← →";
    $("readyStatus").textContent = me.ready ? "¡Estás listo!" : "Aún no has confirmado.";
    $("readyBtn").textContent = me.ready ? "Quitar listo" : "Estoy listo";
  }
}

function createRoom(mode) {
  $("createOptions").classList.add("hidden");
  const name = mode === "player" ? askName("Anfitrión") : null;
  if (mode === "player" && name === null) return;
  socket.emit("room:create", { name, mode }, res => {
    if (!res.ok) return toast("No se pudo crear la sala.");
    myId = res.hostId;
    room = res.code;
    isHost = true;
    myTeamId = res.teamId;
    myAxis = res.axis;
    showScreen(mode === "player" ? "lobby" : "display");
    if (mode === "viewer") renderDisplayLobby({ code: room, teams: [] });
  });
}
$("createBtn").onclick = () => $("createOptions").classList.toggle("hidden");
$("createPlayerBtn").onclick = () => createRoom("player");
$("createViewerBtn").onclick = () => createRoom("viewer");
$("cancelCreate").onclick = () => $("createOptions").classList.add("hidden");
$("viewerStartBtn").onclick = () => socket.emit("game:start");
$("developerModeBtn").onclick = () => $("developerOptions").classList.toggle("hidden");
$("developerPlayerBtn").onclick = () => startDeveloperMode("player");
$("developerViewerBtn").onclick = () => startDeveloperMode("viewer");
function startDeveloperMode(mode) {
  socket.emit("developer:start", { mode }, res => {
    if (!res.ok) return toast(res.error || "No se pudo iniciar el modo developer.");
    room = res.code;
    myId = res.playerId || null;
    isHost = false;
    myTeamId = res.teamId || null;
    myAxis = res.axis || null;
    showScreen(mode === "player" ? "controller" : "display");
  });
}
$("showJoinBtn").onclick = () => $("joinForm").classList.remove("hidden");
$("cancelJoin").onclick = () => $("joinForm").classList.add("hidden");
$("joinForm").onsubmit = e => {
  e.preventDefault();
  const name = $("joinName").value.trim() || "Piloto";
  const code = $("roomCode").value.trim().toUpperCase();
  socket.emit("room:join", { name, code }, res => {
    if (!res.ok) return toast(res.error);
    myId = res.playerId; room = res.code; myTeamId = res.teamId; myAxis = res.axis; isHost = false;
    $("joinForm").classList.add("hidden"); showScreen("controller");
  });
};
$("displayBtn").onclick = () => {
  const code = prompt("Introduce el código de la sala para mostrarla en esta pantalla:"); if (!code) return;
  socket.emit("display:watch", { code: code.trim().toUpperCase() }, res => {
    if (!res.ok) return toast(res.error || "No se encontró la sala.");
    room = res.code; showScreen("display");
  });
};
$("copyCode").onclick = async () => { try { await navigator.clipboard.writeText(room); toast("Código copiado."); } catch { toast("Código: " + room); } };
$("startBtn").onclick = () => socket.emit("game:start");
$("readyBtn").onclick = () => socket.emit("player:ready");
$("newGameBtn").onclick = () => location.reload();

socket.on("room:update", data => {
  updateRoom(data);
  if (role === "display" && data.phase === "lobby") renderDisplayLobby(data);
});
socket.on("game:started", () => {
  $("displayLobby").classList.add("hidden"); $("results").classList.add("hidden"); $("arenaWrap").classList.remove("hidden");
  if (role === "lobby" && isHost) showScreen("controller");
  if (role === "controller") {
    $("waitingController").classList.add("hidden"); $("playingController").classList.remove("hidden"); $("finishedController").classList.add("hidden");
    configureJoystick(); startInputLoop();
  }
  if (role === "display") { $("displayLobby").classList.add("hidden"); $("results").classList.add("hidden"); $("arenaWrap").classList.remove("hidden"); }
});
socket.on("game:state", state => {
  const teams = state.teams || [];
  const me = (state.teams || []).find(t => t.id === myTeamId);
  isCaptured = !!me && me.capturedUntil > Date.now();

  if (me) $("myScore").textContent = me.score;

  // Estado de captura del búho de este jugador
  const captured = me?.capturedUntil > Date.now();

  if (role === "display") {
    drawArena(state, "arena");
    $("timer").textContent = formatTime(state.timeLeft);
    renderScoreboard(teams, "scoreboard");
  }

  if (role === "controller") {
    drawArena(state, "playerArena");

    if (captured) {
      $("controllerCountdown").replaceChildren(
        captureIcon,
        document.createTextNode(` ¡CAPTURADO! ${Math.ceil((me.capturedUntil - Date.now()) / 1000)}s`)
      );
    } else {
      $("controllerCountdown").textContent = `¡A JUGAR! · ${formatTime(state.timeLeft)}`;
    }

    renderScoreboard(teams, "playerScoreboard");
  }
  
});
socket.on("game:finished", ({ ranking }) => {
  stopInputLoop();
  if (fallbackFullscreenTarget) clearFallbackFullscreen();
  else if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFullscreen) {
      Promise.resolve(exitFullscreen.call(document)).catch(error => {
        console.error("Failed to exit fullscreen after the game:", error);
        toast("No se pudo salir de la pantalla completa.");
      });
    }
  }
  if (role === "display") {
    $("arenaWrap").classList.add("hidden"); $("displayLobby").classList.add("hidden"); $("results").classList.remove("hidden");
    const winner = ranking[0];
    $("winnerTitle").textContent = winner ? `${winner.name.toUpperCase()} · GRAN MAESTRO DEL TXAKOLI` : "¡GRAN FIESTA!";
    $("ranking").innerHTML = ranking.map(p => `<div class="rank-row"><span>${p.rank === 1 ? "🏆" : p.rank + ". "} ${escapeHtml(p.name)}<small class="rank-pilots">${(p.pilots || []).map(escapeHtml).join(" + ")}</small></span><span>${p.score} pts</span></div>`).join("");
  } else { $("playingController").classList.add("hidden"); $("finishedController").classList.remove("hidden"); }
});
socket.on("connect_error", () => toast("No se pudo conectar con el servidor."));
socket.on("room:error", msg => toast(msg));

function renderDisplayLobby(data) {
  $("displayLobby").classList.remove("hidden"); $("arenaWrap").classList.add("hidden"); $("results").classList.add("hidden");
  $("displayLobbyCode").textContent = data.code; $("displayUrl").textContent = location.host;
  $("displayPlayers").innerHTML = (data.teams || []).map(t => `<div class="display-player"><span style="color:${t.color}">●</span> ${escapeHtml(t.name)} · ↕ ${escapeHtml(t.pilots?.vertical?.name || "—")} · ↔ ${escapeHtml(t.pilots?.horizontal?.name || "—")}</div>`).join("");
}
function startInputLoop() {
  stopInputLoop();
  inputTimer = setInterval(() => {
    if (isCaptured) {
      socket.emit("player:input", { x: 0, y: 0 });
      return;
    }

    socket.emit("player:input", input);
  }, 50);
}
function stopInputLoop() { if (inputTimer) clearInterval(inputTimer); inputTimer = null; input = { x: 0, y: 0 }; controls.reset(); }

const controls = createJoystick({ onChange: value => { input = value; } });
function configureJoystick() { controls.configure(myAxis); }
