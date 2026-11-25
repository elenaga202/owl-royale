export function createJoystick({ onChange, instructionElementId = "joystickInstruction" } = {}) {
  const joystick = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  const axisGuide = joystick?.querySelector(".axis-guide");
  const instruction = document.getElementById(instructionElementId);
  let axis = "vertical";
  let pointerId = null;

  function send(x, y) {
    if (axis === "vertical") x = 0;
    else y = 0;
    onChange?.({ x, y });
  }

  function reset() {
    pointerId = null;
    if (stick) stick.style.transform = "translate(0px,0px)";
    send(0, 0);
  }

  function configure(nextAxis) {
    axis = nextAxis === "horizontal" ? "horizontal" : "vertical";
    joystick?.classList.toggle("axis-vertical", axis === "vertical");
    joystick?.classList.toggle("axis-horizontal", axis === "horizontal");
    if (axisGuide) axisGuide.textContent = axis === "vertical" ? "↕" : "↔";
    if (instruction) instruction.textContent = axis === "vertical"
      ? "TÚ CONTROLAS ARRIBA Y ABAJO"
      : "TÚ CONTROLAS IZQUIERDA Y DERECHA";
    reset();
  }

  function move(event) {
    if (!joystick || !stick) return;
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const max = Math.max(1, rect.width * .28);
    if (axis === "vertical") {
      dx = 0; dy = Math.max(-max, Math.min(max, dy));
    } else {
      dy = 0; dx = Math.max(-max, Math.min(max, dx));
    }
    stick.style.transform = `translate(${dx}px,${dy}px)`;
    send(dx / max, dy / max);
  }

  if (joystick) {
    joystick.addEventListener("pointerdown", event => {
      if (pointerId !== null || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      pointerId = event.pointerId;
      joystick.setPointerCapture(pointerId);
      move(event);
    });
    joystick.addEventListener("pointermove", event => {
      if (event.pointerId === pointerId) {
        event.preventDefault();
        move(event);
      }
    });
    joystick.addEventListener("pointerup", event => {
      if (event.pointerId === pointerId) reset();
    });
    joystick.addEventListener("pointercancel", event => {
      if (event.pointerId === pointerId) reset();
    });
    joystick.addEventListener("lostpointercapture", event => {
      if (event.pointerId === pointerId) reset();
    });
  }

  return { configure, reset };
}
