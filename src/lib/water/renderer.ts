import { create_water_surface } from "./simulation.js";
import { bind_pointer } from "./pointer.js";
import vertex_source from "./surface.vert?raw";
import fragment_source from "./surface.frag?raw";

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
  const surface_size_uniform = gl.getUniformLocation(program, "u_surface_size");
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
    bind_pointer(canvas, () => water, signal);
  }

  function resize() {
    const { clientWidth: view_width, clientHeight: view_height } = canvas;
    const pixel_budget = 3_000_000;
    const quality_limit = Math.sqrt(pixel_budget / Math.max(1, view_width * view_height));
    const scale = Math.min(devicePixelRatio, 2, quality_limit);
    const width = Math.max(1, Math.round(view_width * scale));
    const height = Math.max(1, Math.round(view_height * scale));
    if (ready && canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    water = create_water_surface(width, height);
    gl.uniform2f(surface_size_uniform, water.width, water.height);
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
