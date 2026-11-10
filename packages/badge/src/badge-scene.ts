// The member badge scene: a procedural bonsai (bonsai.ts) drawn in the sliced-ink look
// from docs/badge/mockups/round-3. Pass 1 renders the tree into an offscreen buffer as
// "ink density" (R) and depth (G). Pass 2 turns that into horizontal lines whose
// thickness follows the density, then adds the streaks, the mist band at the base, the
// drifting dots and dashes and the one red dash.
import * as THREE from "three";
import { bonsaiTraits, buildBonsai, rng, hashSeed, type BonsaiStyle } from "./bonsai";

export type BadgeSceneParams = {
  /** horizontal lines across the canvas height */
  lines: number;
  /** how far rows smear sideways past the silhouette */
  streak: number;
  /** mist band at the base, 0 = none */
  mist: number;
  /** drifting dots and dashes, as a share of the tree's own count */
  particles: number;
  /** animation speed, 0 = still */
  speed: number;
  /** how far the tree turns, radians */
  sway: number;
  /** ground line, 0 top … 1 bottom of the canvas */
  ground: number;
  /** where the card's one red accent goes (see ACCENTS) */
  accent: Accent;
  dark: boolean;
  /** how the member number sits in the card (see NUMBER_STYLES) */
  number: NumberStyle;
  /** depth of the stamped styles */
  depth: number;
};

/** flat and blind are plain CSS; the rest are drawn by the line shader. */
export const NUMBER_STYLES = ["flat", "blind", "sliced", "stamped", "letterpress", "engraved"] as const;
export type NumberStyle = (typeof NUMBER_STYLES)[number];
/** slice: one of the tree's lines in red · seal: a red stamp by the wordmark (CSS) · mote: a red firefly · dash: a red dash in the air */
export const ACCENTS = ["slice", "seal", "mote", "dash", "none"] as const;
export type Accent = (typeof ACCENTS)[number];
const NUMBER_MODE: Record<NumberStyle, number> = { flat: 0, blind: 0, sliced: 1, stamped: 2, letterpress: 3, engraved: 4 };

export const badgeSceneDefaults: BadgeSceneParams = {
  lines: 135, streak: 1, mist: 1, particles: 1, speed: 1, sway: 0.35, ground: 0.7, accent: "seal", dark: false, number: "blind", depth: 1,
};

export const BADGE_COLORS = {
  light: { paper: "#f6f5f2", ink: "#111110" },
  dark: { paper: "#121211", ink: "#ecebe6" },
  red: "#c8342b",
} as const;

const MAX_PARTICLES = 48;

const sceneVertex = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vDepth;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(m) * normal); vUv = uv;
    vec4 mv = viewMatrix * w; vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const sceneFragment = /* glsl */ `
  uniform float uTone, uBark, uGroundY, uNear, uFar; uniform vec3 uLight;
  varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vDepth;
  void main() {
    float lit = max(dot(normalize(vN), uLight), 0.0);
    float d = uTone * (1.0 - 0.3 * lit);
    // bark: grooves that twist up the trunk
    if (uBark > 0.5) d *= 0.8 + 0.2 * smoothstep(-0.3, 0.7, sin(vUv.x * 18.85 + vUv.y * 16.0));
    // the base thins out into the mist
    d *= 0.5 + 0.5 * smoothstep(uGroundY - 0.02, uGroundY + 0.25, vW.y);
    float z = clamp((vDepth - uNear) / (uFar - uNear), 0.0, 1.0);
    d *= 1.0 - 0.25 * z;
    gl_FragColor = vec4(d, z, 0.0, 1.0);
  }`;

const lineFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uRes; uniform float uFill, uPitch, uTime, uStreak, uMist, uGround, uCenterX, uSeed, uRed, uMote, uRedRow;
  uniform vec3 uPaper, uInk, uRedColor;
  uniform vec4 uP[${MAX_PARTICLES}]; uniform int uPN; uniform vec4 uRedDash;
  uniform sampler2D tGlyph; uniform int uNum; uniform float uDepth; uniform vec2 uLight2; uniform vec4 uGlyphBox;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.1 + 7.3) + 0.15 * noise(p * 4.3 + 1.7); }
  float glyph(vec2 px) { return texture2D(tGlyph, px / uRes).r; }
  // the number as ink: only "sliced" lets it into the streaks with the tree
  float ink(vec2 px) { float d = texture2D(tScene, px / uRes).r; return uNum == 1 ? max(d, glyph(px)) : d; }
  // a soft height field of the glyph, for the pressed-in walls
  float relief(vec2 px, float r) {
    float h = glyph(px) * 0.25;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; h += glyph(px + vec2(cos(a), sin(a)) * r) * 0.09375; }
    return h;
  }
  vec2 slope(vec2 px, float r) {
    return vec2(relief(px + vec2(r, 0.0), r) - relief(px - vec2(r, 0.0), r), relief(px + vec2(0.0, r), r) - relief(px - vec2(0.0, r), r));
  }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    bool nearNumber = uNum > 0 && fc.x > uGlyphBox.x && fc.y > uGlyphBox.y && fc.x < uGlyphBox.z && fc.y < uGlyphBox.w;
    bool pressed = nearNumber && (uNum == 2 || uNum == 3);
    // inside a pressed numeral the surface sits lower: its lines drop half a line
    float sunk = pressed ? glyph(fc) : 0.0;
    // the number is small next to the tree: pressed styles get twice the lines to stay legible
    float P = pressed ? uPitch * 0.5 : uPitch;
    float yy = fc.y + sunk * 0.5 * P * min(uDepth, 1.0);
    float row = floor(yy / P);
    float cy = (row + 0.5) * P;
    float dy = abs(yy - cy) / (0.5 * P);
    vec2 at = vec2(fc.x, cy);

    // the row's own ink, plus a smear sideways: a few rows reach far, most barely
    float d = ink(at);
    float rr = hash(vec2(row, uSeed));
    float reach = uStreak * uRes.x * (0.008 + 0.16 * pow(rr, 5.0)) * (0.75 + 0.25 * sin(uTime * 0.6 + rr * 40.0));
    float s = 0.0;
    for (int k = 1; k <= 12; k++) {
      float o = float(k) / 12.0;
      float fall = 1.0 - o * 0.85;
      s = max(s, ink(at + vec2(o * reach, 0.0)) * fall);
      s = max(s, ink(at - vec2(o * reach, 0.0)) * fall);
    }
    float v = max(d, s * 0.5);

    // mist: a dark smear on the ground, then broken lines thinning out upwards
    float h = uRes.y * 0.045;
    float yb = (cy - uGround) / h;
    float xr = (fc.x - uCenterX) / (uRes.x * 0.3);
    float band = exp(-yb * yb * (yb < 0.0 ? 4.0 : 1.6)) * exp(-xr * xr * 1.6);
    float drift = fbm(vec2(fc.x / uRes.x * 4.0 + uTime * 0.025, row * 0.11 - uTime * 0.015));
    float above = exp(-max(yb, 0.0) * 0.55) * step(-0.6, yb) * drift * exp(-xr * xr * 0.5);
    float mist = uMist * max(band * 0.6 * (0.45 + 0.55 * drift), above * 0.28);
    v = max(v * (1.0 - 0.55 * uMist * above), mist);

    // the member number, pressed or inked into the card
    float highlight = 0.0;
    if (pressed) {
      // a narrow wall, so the stroke itself stays open
      float r = (P * 0.6 + 0.8) * uDepth;
      float m = glyph(at);
      // the wall nearest the light falls into shadow (drawn as lines); the far wall catches light
      float shade = clamp(-dot(slope(at, r), uLight2) * 1.8, 0.0, 1.0);
      v = max(v, shade * (uNum == 3 ? 0.95 : 0.8) * min(uDepth, 1.2));
      v = max(v, m * (uNum == 3 ? 0.95 : 0.1 * uDepth));
      highlight = clamp(dot(slope(fc, r), uLight2) * 1.8, 0.0, 1.0) * min(uDepth, 1.0);
    }

    // line thickness follows the ink; light ink breaks into dashes
    float w = uFill * pow(clamp(v, 0.0, 1.0), 0.45);
    float aa = 1.4 / (0.5 * P);
    float cov = 1.0 - smoothstep(w - aa, w + aa, dy);
    float n = noise(vec2(fc.x / (uPitch * 5.0), row * 1.7));
    cov *= smoothstep(0.06, 0.24, v + (n - 0.5) * 0.22);

    if (nearNumber && uNum == 4) {
      // engraved: hairlines at twice the density inside, and a fine contour
      float p2 = uPitch * 0.5, c2 = (floor(fc.y / p2) + 0.5) * p2, d2 = abs(fc.y - c2) / (0.5 * p2);
      float hair = (1.0 - smoothstep(0.3, 0.3 + 2.0 / p2, d2)) * step(0.5, glyph(vec2(fc.x, c2)));
      float rel = relief(fc, 0.9 + 0.6 * uDepth);
      float contour = smoothstep(0.55, 0.85, 1.0 - abs(rel * 2.0 - 1.0));
      cov = max(cov, max(hair, contour));
    }

    float treeCov = cov;
    // drifting particles: dots and short dashes, crisp, not sliced
    for (int i = 0; i < ${MAX_PARTICLES}; i++) {
      if (i >= uPN) break;
      vec4 p = uP[i];
      vec2 q = fc - p.xy;
      float c = p.w < 0.5 ? 1.0 - smoothstep(p.z - 0.8, p.z + 0.8, length(q))
        : (1.0 - smoothstep(p.w - 0.8, p.w + 0.8, abs(q.x))) * (1.0 - smoothstep(p.z * 0.5 - 0.5, p.z * 0.5 + 0.5, abs(q.y)));
      cov = max(cov, c);
    }
    vec2 rq = fc - uRedDash.xy;
    float red = uRed * (1.0 - smoothstep(uRedDash.w - 0.8, uRedDash.w + 0.8, abs(rq.x))) * (1.0 - smoothstep(uRedDash.z * 0.5 - 0.5, uRedDash.z * 0.5 + 0.5, abs(rq.y)));
    // the firefly: a red core with a soft glow around it
    float md = length(rq);
    red = max(red, uMote * max(1.0 - smoothstep(uRedDash.z - 0.8, uRedDash.z + 0.8, md), 0.3 * exp(-md * md / (uRedDash.w * uRedDash.w))));
    // one line of the tree itself, in red
    red = max(red, treeCov * (1.0 - step(0.5, abs(row - uRedRow))));

    vec3 col = mix(uPaper, uInk, cov);
    col = mix(col, uPaper + vec3(0.06), highlight * (1.0 - cov) * 0.9);
    col = mix(col, uRedColor, red);
    col += (hash(fc + fract(uTime) * 91.0) - 0.5) * 0.02;
    gl_FragColor = vec4(col, 1.0);
  }`;

type Particle = { x: number; y: number; size: number; dash: number; phase: number; speed: number };

export function mountBadgeScene(
  canvas: HTMLCanvasElement,
  opts: {
    member: number; style?: BonsaiStyle; params: () => BadgeSceneParams; label?: () => HTMLElement | null;
    /** where pointer movement turns the tree: the card itself (default) or e.g. the window */
    follow?: HTMLElement | Window;
  },
): () => void {
  const traits = bonsaiTraits(opts.member, opts.style);
  const geo = buildBonsai(traits);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 1, 0); // no ink, far depth
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 40);

  const light = new THREE.Vector3(Math.sin(traits.light) * 0.7, 0.75, 0.45).normalize();
  const shared = { uLight: { value: light }, uGroundY: { value: geo.groundY }, uNear: { value: 1 }, uFar: { value: 10 } };
  const material = (tone: number, bark = 0) => new THREE.ShaderMaterial({
    vertexShader: sceneVertex, fragmentShader: sceneFragment,
    uniforms: { ...shared, uTone: { value: tone }, uBark: { value: bark } },
  });
  const tree = new THREE.Group();
  const materials = [material(1, 1), material(1), material(0.32), material(geo.groundY > -0.03 ? 0.6 : 0.95)];
  tree.add(new THREE.Mesh(geo.bark, materials[0]));
  const tuft = new THREE.IcosahedronGeometry(1, 0);
  const leaves = new THREE.InstancedMesh(tuft, materials[1], geo.tufts.length);
  geo.tufts.forEach((m, i) => leaves.setMatrixAt(i, m));
  tree.add(leaves);
  if (geo.dead) tree.add(new THREE.Mesh(geo.dead, materials[2]));
  if (geo.pot) tree.add(new THREE.Mesh(geo.pot, materials[3]));
  // centre the tree on its own footprint so it turns in place and frames evenly
  const pivot = new THREE.Group(); pivot.add(tree); scene.add(pivot);

  // framing: the tree's box, measured once, decides the camera distance
  const box = new THREE.Box3().setFromObject(tree);
  tree.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
  let radius = 0.1;
  const reach = (x: number, z: number) => { radius = Math.max(radius, Math.hypot(x + tree.position.x, z + tree.position.z)); };
  const bark = geo.bark.attributes.position;
  for (let i = 0; i < bark.count; i += 3) reach(bark.getX(i), bark.getZ(i));
  const e = new THREE.Vector3();
  geo.tufts.forEach(m => { e.setFromMatrixPosition(m); reach(e.x * 1.08, e.z * 1.08); });
  const heightWorld = box.max.y - geo.groundY;

  // the member number as a mask, drawn where the card's HTML lays it out
  const glyphCanvas = document.createElement("canvas");
  const glyphTexture = new THREE.CanvasTexture(glyphCanvas);
  glyphTexture.generateMipmaps = false; glyphTexture.minFilter = THREE.LinearFilter;
  const glyphBox = new THREE.Vector4();
  const drawGlyph = async () => {
    const el = opts.label?.();
    if (!el || !width) return;
    const css = getComputedStyle(el);
    const size = parseFloat(css.fontSize) * dpr;
    const font = `${css.fontWeight} ${size}px ${css.fontFamily}`;
    await document.fonts.load(font).catch(() => []);
    // layout offsets ignore the card's tilt transform, unlike getBoundingClientRect
    let x = 0, y = 0;
    for (let n: HTMLElement | null = el; n && n !== canvas.offsetParent; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
    const ctx = glyphCanvas.getContext("2d")!;
    // a resized canvas needs fresh texture storage, not a sub-image upload
    if (glyphCanvas.width !== width || glyphCanvas.height !== height) { glyphCanvas.width = width; glyphCanvas.height = height; glyphTexture.dispose(); }
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.font = font;
    ctx.letterSpacing = `${(parseFloat(css.letterSpacing) || 0) * dpr}px`;
    const text = el.textContent ?? "";
    const metrics = ctx.measureText(text);
    const lineHeight = (parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 0.85) * dpr;
    const top = y * dpr, left = x * dpr;
    const ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
    ctx.fillText(text, left, top + (lineHeight - (ascent + descent)) / 2 + ascent);
    glyphTexture.needsUpdate = true;
    const pad = size * 0.25;
    glyphBox.set(left - pad, height - top - lineHeight - pad, left + metrics.width + pad, height - top + pad);
    draw();
  };

  const post = new THREE.ShaderMaterial({
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: lineFragment,
    uniforms: {
      tScene: { value: target.texture }, uRes: { value: new THREE.Vector2() }, uFill: { value: 0.94 }, uPitch: { value: 4 }, uTime: { value: 0 },
      uStreak: { value: 1 }, uMist: { value: 1 }, uGround: { value: 0 }, uCenterX: { value: 0 }, uSeed: { value: traits.grain * 100 },
      uRed: { value: 1 }, uMote: { value: 0 }, uRedRow: { value: -1 }, uPaper: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uRedColor: { value: new THREE.Color(BADGE_COLORS.red) },
      uP: { value: Array.from({ length: MAX_PARTICLES }, () => new THREE.Vector4()) }, uPN: { value: 0 }, uRedDash: { value: new THREE.Vector4() },
      tGlyph: { value: glyphTexture }, uNum: { value: 0 }, uDepth: { value: 1 }, uLight2: { value: new THREE.Vector2() }, uGlyphBox: { value: new THREE.Vector4() },
    },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), post);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera();

  const r = rng(hashSeed(opts.member + 7919));
  const particles: Particle[] = Array.from({ length: Math.min(MAX_PARTICLES, Math.round(traits.particles * 0.7)) }, () => {
    const dash = r() < 0.35;
    return { x: 0.5 + (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.36), y: 0.15 + r() * 0.65, size: dash ? 0.9 : 0.55 + r() * 0.9, dash: dash ? 3 + r() * 5 : 0, phase: r() * 6.28, speed: 0.5 + r() };
  });

  let width = 0, height = 0, dpr = 1, raf = 0, visible = true, time = 0, last = performance.now();
  let yaw = 0, pitch = 0, pointer = 0, pointerY = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    width = Math.max(1, Math.round(canvas.clientWidth * dpr)); height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    renderer.setSize(width, height, false);
    target.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
    void drawGlyph();
  };

  const draw = () => {
    const p = opts.params();
    // fit: the tree spans from 10% of the height down to the ground line, and 84% of the width
    const span = Math.max(0.2, p.ground - 0.1);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distH = heightWorld / span / (2 * Math.tan(vFov / 2));
    const distW = (radius * 2) / 0.98 / (2 * Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    const visibleH = 2 * dist * Math.tan(vFov / 2);
    // the ground sits at `ground` of the canvas height
    const lookY = geo.groundY + (p.ground - 0.5) * visibleH;
    camera.position.set(0, lookY, dist);
    camera.lookAt(0, lookY, 0);
    shared.uNear.value = dist - radius; shared.uFar.value = dist + radius;
    pivot.rotation.y = traits.turn * 0.15 + yaw;
    pivot.rotation.x = pitch;

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    const u = post.uniforms;
    const colors = p.dark ? BADGE_COLORS.dark : BADGE_COLORS.light;
    u.uRes.value.set(width, height);
    u.uNum.value = NUMBER_MODE[p.number]; u.uDepth.value = p.depth; u.uGlyphBox.value.copy(glyphBox);
    // the stamp's light comes from the upper left and swings with the pointer
    u.uLight2.value.set(-0.55 - pointer * 0.7, 0.85).normalize();
    // light lines on dark spread optically, so they get thinner
    u.uFill.value = p.dark ? 0.72 : 0.94;
    u.uPitch.value = Math.max(2 * dpr, height / p.lines);
    u.uTime.value = time; u.uStreak.value = p.streak; u.uMist.value = p.mist;
    u.uRed.value = p.accent === "dash" ? 1 : 0; u.uMote.value = p.accent === "mote" ? 1 : 0;
    u.uGround.value = (1 - p.ground) * height;
    u.uCenterX.value = width / 2;
    u.uPaper.value.set(colors.paper); u.uInk.value.set(colors.ink);
    const count = Math.round(particles.length * Math.min(1, p.particles));
    particles.slice(0, count).forEach((q, i) => {
      // slow rise and sway; wraps inside the scene area
      const y = 0.12 + ((q.y + time * 0.006 * q.speed) % 0.7);
      const fade = Math.min(1, (y - 0.12) / 0.08, (0.82 - y) / 0.08);
      u.uP.value[i].set((q.x + Math.sin(time * 0.3 * q.speed + q.phase) * 0.015) * width, (1 - y) * height, q.size * dpr * fade, q.dash * dpr);
    });
    u.uPN.value = count;
    const [rx, ry] = traits.red;
    if (p.accent === "mote") {
      // a slow loop around the tree, never still
      const mx = 0.5 + 0.34 * Math.sin(time * 0.13 + traits.grain * 9), my = 0.1 + (p.ground - 0.1) * (0.45 + 0.28 * Math.sin(time * 0.21 + traits.grain * 5));
      u.uRedDash.value.set(mx * width, (1 - my) * height, 1.5 * dpr, 7 * dpr);
    } else u.uRedDash.value.set((rx + Math.sin(time * 0.2) * 0.008) * width, (1 - ry * p.ground) * height, 1.4 * dpr, 6 * dpr);
    // the red slice crosses the upper canopy; its height varies per member
    const sliceY = 0.1 + (p.ground - 0.1) * (0.22 + ry * 0.35);
    u.uRedRow.value = p.accent === "slice" ? Math.floor(((1 - sliceY) * height) / u.uPitch.value) : -1;
    renderer.render(postScene, postCamera);
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    const p = opts.params();
    time += dt * p.speed;
    // the tree turns with the pointer's x and leans with its y, eased, so the 3D reads as you move
    const goal = Math.sin(time * 0.12) * p.sway + pointer * 0.45;
    yaw += (goal - yaw) * Math.min(1, dt * 3);
    pitch += (pointerY * 0.12 - pitch) * Math.min(1, dt * 3);
    draw();
  };

  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const onPointer = (e: Event) => {
    const { clientX, clientY } = e as PointerEvent;
    const rect = canvas.getBoundingClientRect();
    pointer = clamp(((clientX - rect.left) / rect.width - 0.5) * 2);
    pointerY = clamp(((clientY - rect.top) / rect.height - 0.5) * 2);
  };
  const onLeave = () => { pointer = 0; pointerY = 0; };
  const host: HTMLElement | Window = opts.follow ?? canvas.parentElement ?? canvas;
  host.addEventListener("pointermove", onPointer);
  host.addEventListener("pointerleave", onLeave);
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); io.observe(canvas);
  resize();
  if (!reduced) raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    host.removeEventListener("pointermove", onPointer); host.removeEventListener("pointerleave", onLeave);
    [geo.bark, geo.dead, geo.pot, tuft, quad.geometry].forEach(g => g?.dispose());
    [...materials, post].forEach(m => m.dispose());
    leaves.dispose(); target.dispose(); glyphTexture.dispose(); renderer.dispose();
  };
}
