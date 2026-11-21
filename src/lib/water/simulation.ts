// Linear shallow-water model on a staggered grid. Fluxes live on the right
// and bottom faces of each cell. The outer faces stay closed.
export function create_water_surface(view_width: number, view_height: number) {
  const scale = 192 / Math.max(view_width, view_height);
  const width = Math.max(4, Math.round(view_width * scale));
  const height = Math.max(4, Math.round(view_height * scale));
  const size = width * height;
  const level = new Float32Array(size);
  const flow_x = new Float32Array(size);
  const flow_y = new Float32Array(size);
  const pixels = new Uint8Array(size * 4).fill(128);
  let last = 0;
  let remainder = 0;
  let steps_left = 0;

  function impulse(cx: number, cy: number, strength: number) {
    for (let y = Math.max(0, Math.ceil(cy - 4)); y <= Math.min(height - 1, cy + 4); y++) {
      for (let x = Math.max(0, Math.ceil(cx - 4)); x <= Math.min(width - 1, cx + 4); x++) {
        const r = ((x - cx) ** 2 + (y - cy) ** 2) / 16;
        if (r < 1) level[y * width + x]! += strength * (1 - r) ** 3 * (1 - 5 * r);
      }
    }
    steps_left = 420;
  }

  function tap(x: number, y: number) {
    impulse(x * (width - 1), y * (height - 1), -1.8);
  }

  function stroke(x: number, y: number, end_x: number, end_y: number) {
    const start_x = x * (width - 1);
    const start_y = y * (height - 1);
    const dx = (end_x - x) * (width - 1);
    const dy = (end_y - y) * (height - 1);
    const length = Math.hypot(dx, dy);
    if (!length) return false;
    const ux = dx / length;
    const uy = dy / length;
    const radius = 3.5;
    const left = Math.max(0, Math.ceil(start_x + Math.min(0, dx) - radius));
    const right = Math.min(width - 1, Math.floor(start_x + Math.max(0, dx) + radius));
    const top = Math.max(0, Math.ceil(start_y + Math.min(0, dy) - radius));
    const bottom = Math.min(height - 1, Math.floor(start_y + Math.max(0, dy) + radius));

    // Integrate a parabolic pressure profile over the swept segment. Splitting
    // the same path into several pointer events deposits the same total wake.
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const rx = col - start_x;
        const ry = row - start_y;
        const across = ry * ux - rx * uy;
        const span2 = radius * radius - across * across;
        if (span2 <= 0) continue;
        const span = Math.sqrt(span2);
        const along = rx * ux + ry * uy;
        const lo = Math.max(-span, -along);
        const hi = Math.min(span, length - along);
        if (hi <= lo) continue;
        const pressure = (hi - lo) * (span2 - (hi * hi + hi * lo + lo * lo) / 3);
        level[row * width + col]! -= (0.2 * pressure) / (radius * radius);
      }
    }
    steps_left = 420;
    return true;
  }

  function step() {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (x + 1 < width) flow_x[i] = 0.982 * flow_x[i]! + 0.32 * (level[i]! - level[i + 1]!);
        if (y + 1 < height) flow_y[i] = 0.982 * flow_y[i]! + 0.32 * (level[i]! - level[i + width]!);
      }
    }
    for (let i = 0; i < size; i++) {
      const incoming = (i % width ? flow_x[i - 1]! : 0) + (i >= width ? flow_y[i - width]! : 0);
      level[i]! += incoming - flow_x[i]! - flow_y[i]!;
    }
  }

  function update(now: number) {
    remainder += Math.min(64, now - last);
    last = now;
    const count = Math.floor(remainder / (1000 / 60));
    remainder -= count * (1000 / 60);
    if (!steps_left || !count) return false;
    for (let n = 0; n < count && steps_left; n++, steps_left--) step();
    if (!steps_left) {
      level.fill(0);
      flow_x.fill(0);
      flow_y.fill(0);
    }
    for (let i = 0; i < size; i++) {
      const right = i % width === width - 1 ? i : i + 1;
      const bottom = i + width < size ? i + width : i;
      pixels[i * 4] = Math.min(255, Math.max(0, 128 + 280 * (level[right]! - level[i]!)));
      pixels[i * 4 + 1] = Math.min(255, Math.max(0, 128 + 280 * (level[bottom]! - level[i]!)));
    }
    return true;
  }

  return {
    width,
    height,
    pixels,
    tap,
    stroke,
    update,
  };
}
