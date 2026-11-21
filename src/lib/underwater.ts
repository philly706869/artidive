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
uniform sampler2D u_surface;

vec2 swell_slope(vec2 p) {
  float drift = sin(dot(p, vec2(2.2, -1.8)) + u_time * 0.36);
  float first = cos(dot(p, vec2(4.1, 9.2)) - u_time * 1.05 + drift * 1.35);
  float second = cos(dot(p, vec2(-8.4, 6.1)) + u_time * 0.78);
  float third = cos(dot(p, vec2(11.0, 3.7)) - u_time * 1.28 + second * 0.8);
  return vec2(0.41, 0.91) * first * 0.57
    + vec2(-0.81, 0.59) * second * 0.31
    + vec2(0.95, 0.32) * third * 0.20;
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
  vec3 water = texture2D(u_surface, uv).rgb - vec3(128.0 / 255.0);
  vec2 disturbance = water.xy * 0.058;
  vec2 aspect = vec2(screen_aspect, 1.0);
  vec2 swell = swell_slope((uv - 0.5) * aspect);
  vec2 displacement = (disturbance + swell * 0.014) / aspect;
  vec3 image = texture2D(u_image, (uv - 0.5 + displacement) * cover + 0.5).rgb;

  float depth = smoothstep(0.0, 1.0, uv.y);
  float luminance = dot(image, vec3(0.27, 0.58, 0.15));
  vec3 blue = mix(vec3(0.095, 0.26, 0.58), vec3(0.31, 0.65, 0.95), luminance);
  vec3 color = mix(image, blue, 0.70 + depth * 0.13);

  float swell_light = smoothstep(0.05, 0.67, dot(swell, vec2(0.52, -0.85)));
  float surface_light = mix(0.055, 0.17, 1.0 - depth);
  color = mix(color, vec3(0.63, 0.84, 1.0), swell_light * surface_light);
  color = mix(color, vec3(0.89, 0.98, 1.0), bubbles(uv, screen_aspect));
  float crest_light = smoothstep(0.16, 0.45, abs(water.z)) * length(disturbance);
  color = mix(color, vec3(0.73, 0.92, 1.0), min(0.16, crest_light * 4.0));
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
  const surface_texture = gl.createTexture();
  const vertices = gl.createBuffer();
  const texture = gl.createTexture();
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
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
    if (!water) return;
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
    if (event.button !== 0 || drag) return;
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
    if (signal.aborted) return;
    lifecycle.abort();
    cancelAnimationFrame(frame);
    observer?.disconnect();
    canvas.style.opacity = "0";
    gl.deleteTexture(texture);
    gl.deleteTexture(surface_texture);
    gl.deleteBuffer(vertices);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }

  function fallback() {
    cleanup();
    on_status("fallback");
  }

  const start = performance.now();

  function animate(now: number) {
    draw(now);
    frame = requestAnimationFrame(animate);
  }

  if (!vertex || !fragment || !program || !vertices || !texture || !surface_texture) {
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

  gl.uniform1i(gl.getUniformLocation(program, "u_surface"), 1);

  function configure_texture(unit: number, target: WebGLTexture) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  configure_texture(gl.TEXTURE1, surface_texture);
  configure_texture(gl.TEXTURE0, texture);

  function draw(now: number) {
    if (water?.update(now)) {
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

    gl.uniform1f(time_uniform, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function upload_image() {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    if (gl.getError() !== gl.NO_ERROR) {
      fallback();
      return;
    }

    gl.uniform2f(image_size_uniform, image.naturalWidth, image.naturalHeight);
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", move_pointer, { passive: true, signal });
    window.addEventListener("pointerdown", start_pointer, { passive: true, signal });
    window.addEventListener("pointerup", end_pointer, { signal });
    window.addEventListener("pointercancel", end_pointer, { signal });
    window.addEventListener("blur", reset_drag, { signal });
  }

  function resize() {
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
    draw(performance.now());
    canvas.style.opacity = "1";
    if (!ready) {
      ready = true;
      on_status("ready");
      frame = requestAnimationFrame(animate);
    }
  }

  canvas.addEventListener("webglcontextlost", fallback, { signal });
  if (image.complete) {
    if (image.naturalWidth) upload_image();
    else fallback();
  } else {
    image.addEventListener("load", upload_image, { once: true, signal });
    image.addEventListener("error", fallback, { once: true, signal });
  }
  return cleanup;
}
