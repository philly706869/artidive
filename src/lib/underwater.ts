import { create_water_surface } from "./water_surface.js";

const vertex_source = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragment_source = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_image_size;
uniform float u_time;
uniform sampler2D u_ripple_field;
uniform bool u_has_ripples;

float random_value(vec2 cell) {
  vec3 p = fract(cell.xyx * 0.1031);
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 blend = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(random_value(cell), random_value(cell + vec2(1.0, 0.0)), blend.x),
    mix(random_value(cell + vec2(0.0, 1.0)), random_value(cell + vec2(1.0, 1.0)), blend.x),
    blend.y
  );
}

float surface_edge(vec2 point, float time) {
  vec2 cell = floor(point - 0.5);
  vec2 local = point - cell;
  // An entering or leaving cell is at least 1.57 units away.
  // Cap the search radius below that so the sampling window leaves no seams.
  float nearest = 2.40;
  float next = 2.40;

  for (int y = -1; y <= 2; y++) {
    for (int x = -1; x <= 2; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 id = cell + neighbor;
      vec2 seed = vec2(random_value(id + 8.7), random_value(id + 31.4));
      vec2 center = 0.5 + (seed - 0.5) * 0.62;
      center += 0.12 * sin(time * vec2(0.48, 0.61) + seed * 6.283);
      vec2 offset = neighbor + center - local;
      float distance_squared = dot(offset, offset);
      next = min(next, max(nearest, distance_squared));
      nearest = min(nearest, distance_squared);
    }
  }

  // The difference stays continuous when the runner-up changes.
  return (next - nearest) * 0.5;
}

float bubbles(vec2 uv, float aspect) {
  float light = 0.0;
  for (int i = 0; i < 15; i++) {
    float id = float(i);
    float seed = fract(id * 0.618034 + 0.21);
    float progress = fract(id * 0.381966 + 0.14 + u_time * (0.024 + seed * 0.027));
    float lane = mix(0.06, 0.32, fract(id * 0.414214));
    float x = mix(lane, 1.0 - lane, mod(id, 2.0));
    x += sin(progress * 6.283 + id) * 0.018 / aspect;
    float radius = mix(0.004, 0.042, seed * seed);
    vec2 center = vec2(x, 1.08 - progress * 1.16);
    vec2 p = (uv - center) * vec2(aspect, 1.0) / radius;
    float edge = length(p);
    float rim = (1.0 - smoothstep(0.87, 1.04, edge)) * smoothstep(0.68, 0.88, edge);
    float shine = 1.0 - smoothstep(0.68, 1.02, length((p + vec2(0.29, 0.52)) * vec2(2.5, 3.9)));
    light = max(light, min(1.0, rim * 0.78 + shine * 0.92));
  }
  return light;
}

void main() {
  vec2 screen = gl_FragCoord.xy / u_resolution;
  vec2 uv = vec2(screen.x, 1.0 - screen.y);
  float screen_aspect = u_resolution.x / u_resolution.y;
  float image_aspect = u_image_size.x / u_image_size.y;
  vec2 cover = min(vec2(screen_aspect / image_aspect, image_aspect / screen_aspect), 1.0);
  vec2 position = (uv - 0.5) * vec2(screen_aspect, 1.0);

  vec2 flow = position * vec2(3.1, 5.6);
  vec2 warp = vec2(
    noise(flow + vec2(u_time * 0.13, 1.7)),
    noise(flow + vec2(7.2, -u_time * 0.17))
  ) - 0.5;
  vec2 aspect = vec2(screen_aspect, 1.0);
  vec2 disturbance = vec2(0.0);
  float ripple_light = 0.0;
  if (u_has_ripples) {
    vec2 slope = texture2D(u_ripple_field, uv).rg - vec2(128.0 / 255.0);
    vec2 ripple_offset = slope * 0.058;
    disturbance = ripple_offset;
    ripple_light = length(ripple_offset) * 5.1;
  }

  vec2 displacement = warp * 0.019 + disturbance / aspect;
  vec3 image = texture2D(u_image, (uv - 0.5 + displacement) * cover + 0.5).rgb;

  float depth = smoothstep(0.0, 1.0, uv.y);
  float luminance = dot(image, vec3(0.27, 0.58, 0.15));
  vec3 blue = mix(vec3(0.095, 0.26, 0.58), vec3(0.31, 0.65, 0.95), luminance);
  vec3 color = mix(image, blue, 0.70 + depth * 0.13);

  // Stretch the cells into broad, curved pools with shared reflective edges.
  float surface = 1.0 - smoothstep(0.0, 0.40, uv.y);
  float compressed_depth = uv.y + 0.36 * (1.0 - exp(-5.0 * uv.y));
  vec2 water_position = vec2(position.x * 2.65, compressed_depth * 5.0);
  water_position += warp * vec2(0.9, 1.35) + disturbance * vec2(2.65, 5.0);
  water_position.y += sin(position.x * 7.2 - u_time * 0.52 + uv.y * 5.0) * 0.27;
  water_position += vec2(u_time * 0.095, -u_time * 0.12);

  float edge = surface_edge(water_position, u_time);
  float edge_width = mix(0.07, 0.21, noise(water_position * 0.74 + 5.0));
  float rim = 1.0 - smoothstep(0.024, edge_width, edge);
  float glint = (1.0 - smoothstep(0.012, edge_width * 0.54, edge))
    * smoothstep(0.48, 0.74, noise(water_position * 0.92 + 16.0));
  float pool = smoothstep(0.03, 0.22, edge) * (noise(water_position * 0.65 + 9.3) - 0.5);
  color += vec3(0.07, 0.19, 0.29) * pool * (0.65 + 0.75 * surface);
  color = mix(color, vec3(0.39, 0.72, 1.0), rim * (0.19 + 0.46 * surface));
  color = mix(color, vec3(0.94, 0.99, 1.0), glint * (0.13 + 0.76 * surface));
  color = mix(color, vec3(0.89, 0.98, 1.0), bubbles(uv, screen_aspect));
  color = mix(color, vec3(0.73, 0.92, 1.0), min(0.35, ripple_light));
  gl_FragColor = vec4(color, 1.0);
}
`;

function compile_shader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;

  gl.deleteShader(shader);
  return null;
}

export function mount_underwater(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  on_status: (status: "ready" | "fallback") => void,
) {
  const context = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!context) {
    on_status("fallback");
    return undefined;
  }
  const gl = context;

  const vertex = compile_shader(gl, gl.VERTEX_SHADER, vertex_source);
  const fragment = compile_shader(gl, gl.FRAGMENT_SHADER, fragment_source);
  const program = gl.createProgram();
  const ripple_texture = gl.createTexture();
  const vertices = gl.createBuffer();
  const texture = gl.createTexture();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let ready = false;

  let water: ReturnType<typeof create_water_surface> | undefined;
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;

  function pointer_position(event: PointerEvent, bounds = canvas.getBoundingClientRect()) {
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  function move_pointer(event: PointerEvent) {
    if (motion.matches || !water) return;
    const active_drag = drag?.id === event.pointerId ? drag : undefined;
    if (!active_drag) return;

    const now = performance.now();
    const bounds = canvas.getBoundingClientRect();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) {
      const { x, y } = pointer_position(sample, bounds);
      if (water.stroke(active_drag.x, active_drag.y, x, y, now)) active_drag.moved = true;
      active_drag.x = x;
      active_drag.y = y;
    }
  }

  function start_pointer(event: PointerEvent) {
    if (motion.matches || event.button !== 0 || drag) return;
    const { x, y } = pointer_position(event);
    water?.begin_stroke();
    drag = { id: event.pointerId, x, y, moved: false };
  }

  function end_pointer(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    if (event.type === "pointerup") {
      move_pointer(event);
      if (!drag.moved) water?.tap(drag.x, drag.y, performance.now());
    }
    reset_drag();
  }

  function reset_drag() {
    drag = undefined;
  }

  function cleanup() {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    motion.removeEventListener("change", update_motion);
    window.removeEventListener("pointermove", move_pointer);
    window.removeEventListener("pointerdown", start_pointer);
    window.removeEventListener("pointerup", end_pointer);
    window.removeEventListener("pointercancel", end_pointer);
    window.removeEventListener("blur", reset_drag);
    canvas.removeEventListener("webglcontextlost", fallback);
    canvas.style.opacity = "0";
    image.removeEventListener("load", upload_image);
    image.removeEventListener("error", fallback);
    gl.deleteTexture(texture);
    gl.deleteTexture(ripple_texture);
    gl.deleteBuffer(vertices);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }

  function fallback() {
    cleanup();
    on_status("fallback");
  }

  function update_motion() {
    cancelAnimationFrame(frame);
    if (!ready) return;
    if (motion.matches) {
      reset_drag();
      water?.reset();
      draw(0);
    } else {
      frame = requestAnimationFrame(animate);
    }
  }

  const start = performance.now();

  function animate(now: number) {
    draw((now - start) / 1000, now);
    frame = requestAnimationFrame(animate);
  }

  if (!vertex || !fragment || !program || !vertices || !texture || !ripple_texture) {
    fallback();
    return undefined;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    fallback();
    return undefined;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const viewport_uniform = gl.getUniformLocation(program, "u_resolution");
  const image_size_uniform = gl.getUniformLocation(program, "u_image_size");
  const time_uniform = gl.getUniformLocation(program, "u_time");

  const has_ripples_uniform = gl.getUniformLocation(program, "u_has_ripples");
  gl.uniform1i(gl.getUniformLocation(program, "u_ripple_field"), 1);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, ripple_texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);

  function draw(time: number, now = performance.now()) {
    const has_ripples = water?.update(now) ?? false;
    if (water && has_ripples) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        water.width,
        water.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        water.pixels,
      );
      gl.activeTexture(gl.TEXTURE0);
    }

    gl.uniform1i(has_ripples_uniform, Number(has_ripples));
    gl.uniform1f(time_uniform, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function upload_image() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    if (gl.getError() !== gl.NO_ERROR) {
      fallback();
      return;
    }

    gl.uniform2f(image_size_uniform, image.naturalWidth, image.naturalHeight);
    observer = new ResizeObserver(() => {
      const scale = Math.min(devicePixelRatio, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (ready && canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      water = create_water_surface(width, height);
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        water.width,
        water.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        water.pixels,
      );
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, width, height);
      gl.uniform2f(viewport_uniform, width, height);
      draw(motion.matches ? 0 : (performance.now() - start) / 1000);
      canvas.style.opacity = "1";
      if (!ready) {
        ready = true;
        on_status("ready");
        if (!motion.matches) frame = requestAnimationFrame(animate);
      }
    });
    observer.observe(canvas);
    motion.addEventListener("change", update_motion);
    window.addEventListener("pointermove", move_pointer, { passive: true });
    window.addEventListener("pointerdown", start_pointer, { passive: true });
    window.addEventListener("pointerup", end_pointer);
    window.addEventListener("pointercancel", end_pointer);
    window.addEventListener("blur", reset_drag);
  }

  canvas.addEventListener("webglcontextlost", fallback);
  if (image.complete) {
    if (image.naturalWidth) upload_image();
    else fallback();
  } else {
    image.addEventListener("load", upload_image, { once: true });
    image.addEventListener("error", fallback, { once: true });
  }
  return cleanup;
}
