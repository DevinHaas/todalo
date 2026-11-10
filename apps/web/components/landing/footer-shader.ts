// The landing page's CTA → footer dissolve (brief §2.6): WebGL2 shaders from the page's
// off-white into the footer's ink, reacting to the mouse. One module for both the page
// (footerShaderDefaults) and the Toolcraft lab in apps/client (footer.html), where the
// values are tuned and copied back here as JSON.

export const FOOTER_VARIANTS = ["mist", "ink", "halftone", "contours"] as const;
export type FooterVariant = (typeof FOOTER_VARIANTS)[number];

export type FooterShaderParams = {
  variant: FooterVariant;
  /** band height, CSS px */
  height: number;
  /** animation speed, 1 = calm default */
  speed: number;
  /** pattern scale (noise size, dot size or line count, per variant) */
  scale: number;
  /** where the page turns to ink, 0 top … 1 bottom */
  edge: number;
  /** how soft that turn is */
  softness: number;
  /** film grain in the transition */
  grain: number;
  /** how strongly the cursor pushes the ink back */
  pull: number;
  /** cursor reach, CSS px */
  radius: number;
  /** Todalo red where the cursor touches the ink, 0 = none */
  accent: number;
};

export const footerShaderDefaults: FooterShaderParams = {
  variant: "mist",
  height: 260,
  speed: 1,
  scale: 2.2,
  edge: 0.5,
  softness: 0.22,
  grain: 0.5,
  pull: 0.7,
  radius: 160,
  accent: 0,
};

const HEADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uDpr, uScale, uEdge, uSoft, uGrain, uPull, uRadius, uAccent;
uniform vec3 uMouse; // xy: device px from the bottom-left, z: presence 0..1
out vec4 outColor;
const vec3 LIGHT = vec3(0.961, 0.957, 0.945); // #f5f4f1, the page
const vec3 INK = vec3(0.071, 0.071, 0.067);   // #121211, the footer
const vec3 BRAND = vec3(0.984, 0.173, 0.212); // --brand

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; } return v; }
// 1 at the cursor, fading out over uRadius
float cursorAt(vec2 px) { float d = distance(px, uMouse.xy) / (uRadius * uDpr); return uMouse.z * exp(-d * d * 2.); }
// 0 on the top row (page) … 1 on the bottom row (footer)
float depthT(float y) { return 1. - y / uRes.y; }
// Seamless edges: exactly the page colour at the top, exactly the ink at the bottom.
float pinEnds(float m, float t) { return mix(0., mix(m, 1., smoothstep(.86, 1., t)), smoothstep(0., .14, t)); }
vec3 finish(float m, float glow, float t) {
  vec3 c = mix(LIGHT, INK, m);
  c = mix(c, BRAND, uAccent * glow * m * .55);
  float g = (hash(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * uGrain * .09;
  return c + g * smoothstep(0., .14, t) * (1. - smoothstep(.86, 1., t));
}
`;

const BODIES: Record<FooterVariant, string> = {
  // Soft fog of ink rising from the footer; the cursor clears a bubble in it.
  mist: `
void main() {
  float t = depthT(gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float c = cursorAt(gl_FragCoord.xy);
  float n = fbm(uv * uScale + vec2(uTime * .04, -uTime * .06));
  float m = smoothstep(uEdge - uSoft, uEdge + uSoft, t + (n - .5) * .55 - c * uPull * .35);
  outColor = vec4(finish(pinEnds(m, t), c, t), 1.);
}`,
  // Domain-warped ink, like a drop spreading in water; the cursor stirs it.
  ink: `
void main() {
  float t = depthT(gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float c = cursorAt(gl_FragCoord.xy);
  vec2 away = normalize(gl_FragCoord.xy - uMouse.xy + 1e-3);
  vec2 p = uv * uScale + away * c * uPull * .6;
  vec2 q = vec2(fbm(p + vec2(0., uTime * .05)), fbm(p + vec2(5.2, 1.3) - uTime * .04));
  vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + uTime * .03), fbm(p + 3. * q + vec2(8.3, 2.8)));
  float n = fbm(p + 2.5 * r);
  float m = smoothstep(uEdge - uSoft, uEdge + uSoft, t + (n - .5) * .8);
  m = clamp(m * (.88 + .24 * n), 0., 1.);
  outColor = vec4(finish(pinEnds(m, t), c, t), 1.);
}`,
  // Round print halftone at 45°, like the page's black-and-white imagery; dots shrink under the cursor.
  halftone: `
void main() {
  float cell = (3. + uScale * 2.) * uDpr;
  mat2 R = mat2(.7071, -.7071, .7071, .7071);
  vec2 g = R * gl_FragCoord.xy / cell;
  vec2 id = floor(g), f = fract(g) - .5;
  vec2 centre = transpose(R) * ((id + .5) * cell);
  float tc = depthT(centre.y);
  float n = fbm(centre / uRes.y * 2. + vec2(uTime * .05, 0.));
  float c = cursorAt(centre);
  float cov = pinEnds(smoothstep(uEdge - uSoft, uEdge + uSoft, tc + (n - .5) * .3 - c * uPull * .4), tc);
  float d = length(f), r = sqrt(cov) * .72, aa = fwidth(d);
  float t = depthT(gl_FragCoord.y);
  float m = pinEnds(1. - smoothstep(r - aa, r + aa, d), t);
  outColor = vec4(finish(m, cursorAt(gl_FragCoord.xy), t), 1.);
}`,
  // Topographic lines that thicken into the footer; the cursor bends them.
  contours: `
void main() {
  float t = depthT(gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float c = cursorAt(gl_FragCoord.xy);
  float n = fbm(uv * 1.4 + vec2(uTime * .03, 0.));
  float v = t + (n - .5) * .35 - c * uPull * .25;
  float x = v * (6. + uScale * 4.);
  float d = abs(fract(x + .5) - .5) * 2.;
  float w = mix(.06, 1.02, smoothstep(uEdge - uSoft * 1.5, uEdge + uSoft * 1.5, v));
  float aa = fwidth(x) * 2.;
  float m = 1. - smoothstep(w - aa, w + aa, d);
  outColor = vec4(finish(pinEnds(m, t), c, t), 1.);
}`,
};

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0., 1.); }`;

const UNIFORMS = ["uRes", "uTime", "uDpr", "uScale", "uEdge", "uSoft", "uGrain", "uPull", "uRadius", "uAccent", "uMouse"] as const;

/**
 * Draws the dissolve into `canvas` (sized by CSS) until the returned cleanup runs.
 * `read` is called every frame, so live edits (the lab) show at once.
 * Without WebGL2 it does nothing and the canvas stays transparent.
 */
export function mountFooterShader(canvas: HTMLCanvasElement, read: () => FooterShaderParams): () => void {
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
  if (!gl) return () => {};

  const programs = new Map<FooterVariant, { program: WebGLProgram; at: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null> } | null>();
  const compile = (variant: FooterVariant) => {
    if (programs.has(variant)) return programs.get(variant)!;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(`footer shader "${variant}":`, gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, HEADER + BODIES[variant]));
    gl.bindAttribLocation(program, 0, "p");
    gl.linkProgram(program);
    const entry = gl.getProgramParameter(program, gl.LINK_STATUS)
      ? { program, at: Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null> }
      : null;
    programs.set(variant, entry);
    return entry;
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Cursor in canvas device px (from the bottom-left), eased so the ink follows softly.
  const mouse = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };
  const onMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    // reacts a little before the pointer reaches the band
    const near = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top - 120 && event.clientY <= rect.bottom + 120;
    mouse.tx = (event.clientX - rect.left) * dpr;
    mouse.ty = (rect.bottom - event.clientY) * dpr;
    if (!mouse.on && near) [mouse.x, mouse.y] = [mouse.tx, mouse.ty];
    mouse.target = near ? 1 : 0;
  };
  const onLeave = () => (mouse.target = 0);
  addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);

  let time = 0;
  let last = performance.now();
  let frame = 0;
  let visible = false;

  const draw = (now: number) => {
    const params = read();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!still) time += dt * params.speed;
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 6);
    mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 6);
    mouse.on += (mouse.target - mouse.on) * Math.min(1, dt * 3);

    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) [canvas.width, canvas.height] = [w, h];
    const entry = compile(params.variant);
    if (!entry) return;
    const { program, at } = entry;
    gl.useProgram(program);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(at.uRes, w, h);
    gl.uniform1f(at.uTime, time);
    gl.uniform1f(at.uDpr, dpr);
    gl.uniform1f(at.uScale, params.scale);
    gl.uniform1f(at.uEdge, params.edge);
    gl.uniform1f(at.uSoft, params.softness);
    gl.uniform1f(at.uGrain, params.grain);
    gl.uniform1f(at.uPull, params.pull);
    gl.uniform1f(at.uRadius, params.radius);
    gl.uniform1f(at.uAccent, params.accent);
    gl.uniform3f(at.uMouse, mouse.x, mouse.y, mouse.on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.style.opacity = "1";
  };
  const loop = (now: number) => {
    draw(now);
    if (visible) frame = requestAnimationFrame(loop);
  };
  // Only runs while on screen.
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    cancelAnimationFrame(frame);
    if (visible) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  });
  observer.observe(canvas);

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
  };
}
