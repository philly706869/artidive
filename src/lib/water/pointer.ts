import type { create_water_surface } from "./simulation.js";

export function bind_pointer(
  canvas: HTMLCanvasElement,
  get_surface: () => ReturnType<typeof create_water_surface> | undefined,
  signal: AbortSignal,
) {
  type Trail = { id: number; x: number; y: number; time: number; moved: boolean };
  let trail: Trail | undefined;

  function pointer_position(event: PointerEvent, bounds: DOMRect) {
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  function start_pointer(event: PointerEvent) {
    if (event.button !== 0 || trail) return;
    trail = {
      ...pointer_position(event, canvas.getBoundingClientRect()),
      id: event.pointerId,
      time: event.timeStamp,
      moved: false,
    };
  }

  function move_pointer(event: PointerEvent) {
    const water = get_surface();
    if (!water || trail?.id !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of [...samples, event]) {
      const target = pointer_position(sample, bounds);
      const elapsed = Math.max(0, sample.timeStamp - trail.time);
      const blend = event.type === "pointerup" ? 1 : -Math.expm1(-elapsed / 14);
      const x = trail.x + (target.x - trail.x) * blend;
      const y = trail.y + (target.y - trail.y) * blend;
      if (water.stroke(trail.x, trail.y, x, y)) trail.moved = true;
      trail.x = x;
      trail.y = y;
      trail.time = sample.timeStamp;
    }
  }

  function end_pointer(event: PointerEvent) {
    if (trail?.id !== event.pointerId) return;
    if (event.type === "pointerup") {
      move_pointer(event);
      if (!trail.moved) get_surface()?.tap(trail.x, trail.y);
    }
    reset_drag();
  }

  function reset_drag() {
    trail = undefined;
  }

  window.addEventListener("pointermove", move_pointer, { passive: true, signal });
  window.addEventListener("pointerdown", start_pointer, { passive: true, signal });
  window.addEventListener("pointerup", end_pointer, { signal });
  window.addEventListener("pointercancel", end_pointer, { signal });
  window.addEventListener("blur", reset_drag, { signal });
}
