const grid_size = 160;
const step_ms = 1000 / 60;
const settle_ms = 2200;
const stroke_spacing = 0.9;

export function create_water_surface(view_width: number, view_height: number) {
  const scale = grid_size / Math.max(view_width, view_height);
  const width = Math.max(8, Math.round(view_width * scale));
  const height = Math.max(8, Math.round(view_height * scale));
  const size = width * height;
  let current = new Float32Array(size);
  let previous = new Float32Array(size);
  const damping = new Float32Array(size);
  const pixels = new Uint8ClampedArray(size * 4).fill(128);
  let active_until = -Infinity;
  let last_frame = 0;
  let pending_ms = 0;
  let distance_to_sample = stroke_spacing * 0.5;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      damping[y * width + x] = 0.963 - 0.16 * Math.max(0, 1 - edge / 7);
    }
  }

  function begin_stroke() {
    distance_to_sample = stroke_spacing * 0.5;
  }

  function reset() {
    current.fill(0);
    previous.fill(0);
    active_until = -Infinity;
    pending_ms = 0;
    begin_stroke();
  }

  function disturb(x: number, y: number, amount: number) {
    const radius = 3.3;
    for (
      let row = Math.max(1, Math.ceil(y - radius));
      row <= Math.min(height - 2, y + radius);
      row++
    ) {
      for (
        let col = Math.max(1, Math.ceil(x - radius));
        col <= Math.min(width - 2, x + radius);
        col++
      ) {
        const falloff = Math.max(0, 1 - ((col - x) ** 2 + (row - y) ** 2) / radius ** 2);
        const index = row * width + col;
        previous[index] = previous[index]! - amount * falloff * falloff;
      }
    }
  }

  function tap(x: number, y: number, now: number) {
    disturb(x * width - 0.5, y * height - 0.5, 0.62);
    active_until = now + settle_ms;
  }

  function stroke(from_x: number, from_y: number, to_x: number, to_y: number, now: number) {
    const dx = (to_x - from_x) * width;
    const dy = (to_y - from_y) * height;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return false;

    const normal_x = (-dy / distance) * 1.9;
    const normal_y = (dx / distance) * 1.9;
    let traveled = distance_to_sample;
    while (traveled <= distance) {
      const fraction = traveled / distance;
      const x = from_x * width - 0.5 + dx * fraction;
      const y = from_y * height - 0.5 + dy * fraction;
      // A trough along the path pushes water toward both sides.
      disturb(x, y, -0.14);
      disturb(x + normal_x, y + normal_y, 0.07);
      disturb(x - normal_x, y - normal_y, 0.07);
      traveled += stroke_spacing;
    }

    const sampled = distance_to_sample <= distance;
    distance_to_sample = traveled - distance;
    if (sampled) active_until = now + settle_ms;
    return sampled;
  }

  function update(now: number) {
    const elapsed = Math.min(now - last_frame, step_ms * 3);
    last_frame = now;
    if (now >= active_until) {
      if (active_until !== -Infinity) reset();
      return false;
    }

    pending_ms += Math.max(0, elapsed);
    while (pending_ms >= step_ms) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const index = y * width + x;
          const level = current[index]!;
          const velocity = level - previous[index]!;
          const neighbors =
            current[index - 1]! +
            current[index + 1]! +
            current[index - width]! +
            current[index + width]!;
          // Advance a damped 2D wave equation with fixed time steps.
          previous[index] = level + (velocity + 0.24 * (neighbors - 4 * level)) * damping[index]!;
        }
      }
      [current, previous] = [previous, current];
      pending_ms -= step_ms;
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        pixels[index * 4] = 128 + (current[index + 1]! - current[index - 1]!) * 160;
        pixels[index * 4 + 1] = 128 + (current[index + width]! - current[index - width]!) * 160;
      }
    }
    return true;
  }

  return { width, height, pixels, reset, tap, begin_stroke, stroke, update };
}
