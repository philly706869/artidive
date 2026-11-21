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
uniform vec2 u_surface_size;

vec4 sample_surface(vec2 uv) {
  vec2 grid = uv * u_surface_size - 0.5;
  vec2 f = fract(grid);
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 inv = 1.0 - f;
  vec2 w0 = inv * inv * inv / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;

  // Combine adjacent cubic B-spline taps using the texture's bilinear filter.
  vec2 low_weight = w0 + w1;
  vec2 high_weight = w2 + w3;
  vec2 base = floor(grid) + 0.5;
  vec2 low = (base - 1.0 + w1 / low_weight) / u_surface_size;
  vec2 high = (base + 1.0 + w3 / high_weight) / u_surface_size;
  vec4 top = mix(texture2D(u_surface, low),
    texture2D(u_surface, vec2(high.x, low.y)), high_weight.x);
  vec4 bottom = mix(texture2D(u_surface, vec2(low.x, high.y)),
    texture2D(u_surface, high), high_weight.x);
  return mix(top, bottom, high_weight.y);
}

vec2 swell_slope(vec2 p) {
  float drift = sin(dot(p, vec2(2.2, -1.8)) + u_time * 0.36);
  float first = cos(dot(p, vec2(4.1, 9.2)) - u_time * 1.05 + drift * 1.35);
  float second = cos(dot(p, vec2(-8.4, 6.1)) + u_time * 0.78);
  float third = cos(dot(p, vec2(11.0, 3.7)) - u_time * 1.28 + second * 0.8);
  return vec2(0.41, 0.91) * first * 0.57
    + vec2(-0.81, 0.59) * second * 0.31
    + vec2(0.95, 0.32) * third * 0.20;
}

void main() {
  vec2 screen = gl_FragCoord.xy / u_resolution;
  vec2 uv = vec2(screen.x, 1.0 - screen.y);
  float screen_aspect = u_resolution.x / u_resolution.y;
  float image_aspect = u_image_size.x / u_image_size.y;
  vec2 cover = min(vec2(screen_aspect / image_aspect, image_aspect / screen_aspect), 1.0);
  vec4 water = sample_surface(uv) - vec4(128.0 / 255.0);
  vec2 aspect = vec2(screen_aspect, 1.0);
  vec2 swell = swell_slope((uv - 0.5) * aspect);
  vec2 slope = swell * 0.16 + water.xy * 2.6;
  vec2 offset = slope * 0.025 / aspect;
  vec3 image = texture2D(u_image, (uv - 0.5 + offset) * cover + 0.5).rgb;
  float depth = smoothstep(0.0, 1.0, uv.y);
  vec3 tint = mix(vec3(0.10, 0.66, 0.69), vec3(0.025, 0.26, 0.49), depth);
  vec3 color = mix(image, tint, 0.23 + depth * 0.13);
  float highlight = dot(normalize(vec3(slope, 1.0)), normalize(vec3(-0.34, -0.27, 1.0)));
  color += vec3(0.58, 0.80, 0.91) * pow(max(0.0, highlight), 28.0) * 0.24;
  gl_FragColor = vec4(color, 1.0);
}
