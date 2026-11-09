// The liquid Coach button: a small spring simulation of soft shapes (pure, tested
// in liquid.test.ts) drawn by one WebGL2 signed-distance shader. Shapes join with
// a smooth minimum ("goo"); a stretching capsule between two shapes is the neck
// that thins as it lengthens and drains, and pinches off below a threshold into
// beads (satellites) that flow on into the body. Opening, the resting blob flows
// to the bar's place and spreads into it; the × buds off the bar's right end.
// Closing runs the same physics back to the corner.

export type LiquidParams = {
  /** Resting blob radius, px. */
  size: number;
  /** Rough time for the morph, seconds (sets the spring frequency). */
  duration: number;
  /** Surface tension: how stiff the jiggle is and how fast corners round. 0.2–3. */
  tension: number;
  /** Viscosity: the damping ratio of every spring. Low wobbles and overshoots. */
  viscosity: number;
  /** Size springs lag the position by this factor (the flow, then the spread). */
  lag: number;
  /** Idle surface motion. */
  wobbleSpeed: number;
  wobbleAmp: number;
  /** Fraction of the wobble the open bar keeps. */
  barWobble: number;
  /** Opening spreads into the bar once this fraction of the way is left. */
  spreadAt: number;
  /** Squash and stretch along the velocity. */
  stretch: number;
  /** Smooth-minimum radius, px: how far apart two shapes still join. */
  goo: number;
  /** Neck length scale, px: longer necks stay thick for longer. */
  neck: number;
  /** A neck thinner than this (px) pinches off. */
  pinch: number;
  /** Beads a pinched neck breaks into. */
  satellites: number;
  /** The × droplet's radius, px. */
  closeSize: number;
  /** 0 = the × is blob coloured, 1 = bar coloured. */
  closeTint: number;
  gloss: number;
  shadow: number;
  blobColor: string;
};

export const liquidDefaults: LiquidParams = {
  size: 24, duration: 0.45, tension: 1, viscosity: 0.6, lag: 0.7, spreadAt: 0.35,
  wobbleSpeed: 1, wobbleAmp: 2.2, barWobble: 0.15, stretch: 1,
  goo: 16, neck: 46, pinch: 2.5, satellites: 2,
  closeSize: 15, closeTint: 1, gloss: 0.55, shadow: 1,
  blobColor: "#dc4c3e",
};

/** A rounded box: centre, half size, corner radius. */
export type Box = { x: number; y: number; w: number; h: number; r: number };

type Body = Box & {
  vx: number; vy: number; vw: number; vh: number; vr: number;
  /** The jiggle: width grows while height shrinks, and back. */
  j: number; vj: number;
  /** 0 = blob colour, 1 = bar colour. */
  mix: number; vmix: number;
  target: Box; targetMix: number;
  posOmega: number; sizeOmega: number;
  wobble: number; seed: number;
  /** Merges into this body and disappears once inside. */
  into?: Body;
};
/** `life`: seconds for the neck to drain to a third. */
type Bridge = { a: Body; b: Body; age: number; base: number; life: number };
/** One drawable: a rounded box (stretched along dir) or, with `segment`, a capsule a→b. */
export type Shape = { x: number; y: number; w: number; h: number; r: number; wobble: number; mix: number; stretch: number; dx: number; dy: number; seed: number; segment: boolean };
export type Phase = "closed" | "opening" | "open" | "closing";

const makeBody = (box: Box, mix: number, seed: number): Body => ({
  ...box, vx: 0, vy: 0, vw: 0, vh: 0, vr: 0, j: 0, vj: 0, mix, vmix: 0,
  target: { ...box }, targetMix: mix, posOmega: 1, sizeOmega: 1, wobble: 0, seed,
});
const spring = (x: number, v: number, to: number, omega: number, zeta: number, dt: number) => {
  const a = omega * omega * (to - x) - 2 * zeta * omega * v;
  v += a * dt;
  return [x + v * dt, v] as const;
};
const logSpring = (x: number, v: number, to: number, omega: number, zeta: number, dt: number) => {
  const [next, velocity] = spring(Math.log(x + 1), v, Math.log(Math.max(to, 0) + 1), omega, zeta, dt);
  return [Math.exp(next) - 1, velocity] as const;
};
const radius = (box: Box) => Math.min(box.w, box.h);
/** The closest point to (x, y) on a box's core (the box shrunk by its corner radius). */
const core = (box: Box, x: number, y: number): [number, number] => {
  const r = Math.min(box.r, box.w, box.h);
  return [Math.max(box.x - box.w + r, Math.min(box.x + box.w - r, x)), Math.max(box.y - box.h + r, Math.min(box.y + box.h - r, y))];
};

export class LiquidSim {
  params: LiquidParams;
  phase: Phase = "closed";
  body: Body;
  /** The remnant left behind at the start of a morph, draining through the neck. */
  anchor: Body | null = null;
  /** The × droplet. */
  drop: Body | null = null;
  bridges: Bridge[] = [];
  satellites: Body[] = [];
  /** Counts pinch-offs (tests, and the lab's readout). */
  pinches = 0;
  private blob: Box;
  private bar: Box;
  private close: Box;
  private seed = 1;
  private travel = 0;
  private spreading = true;
  private gathered = true;

  constructor(params: LiquidParams, targets: { blob: Box; bar: Box; close: Box }) {
    this.params = params;
    this.blob = targets.blob; this.bar = targets.bar; this.close = targets.close;
    this.body = makeBody(this.blob, 0, 0);
  }

  setTargets(targets: { blob: Box; bar: Box; close: Box }) {
    this.blob = targets.blob; this.bar = targets.bar; this.close = targets.close;
  }

  setOpen(open: boolean) {
    if (open === (this.phase === "opening" || this.phase === "open")) return;
    const { body } = this;
    this.phase = open ? "opening" : "closing";
    // The remnant: a copy of the body where it is now, pinned, rounding into a drop and draining.
    const anchor = { ...this.body, vx: 0, vy: 0, vw: 0, vh: 0, vr: 0, j: 0, vj: 0, seed: this.seed++ };
    anchor.target = { ...anchor, w: radius(anchor), h: radius(anchor), r: radius(anchor) };
    // Closing, the leftovers turn blob coloured as they flow (white beads on white read as ghosts).
    anchor.targetMix = open ? anchor.mix : 0;
    this.anchor = anchor;
    this.bridges = this.bridges.filter(bridge => bridge.a !== body && bridge.b !== body);
    this.bridges.push({ a: anchor, b: body, age: 0, base: radius(anchor), life: this.params.duration * 0.9 });
    // Opening the drop first starts small (it spreads after flowing); closing gathers into a ball first.
    if (open) { body.w = body.h = body.r = Math.min(radius(body), this.params.size) * 0.9; }
    this.spreading = false; this.gathered = false;
    this.travel = Math.hypot(body.x - this.bar.x, body.y - this.bar.y);
    // The × flows back into the body.
    if (!open && this.drop) { this.drop.into = body; this.bridges = this.bridges.filter(bridge => bridge.b !== this.drop); this.satellites.push(this.drop); this.drop = null; }
  }

  step(dt: number) {
    const p = this.params;
    const omega = 4.6 / Math.max(p.duration, 0.05);
    const zeta = p.viscosity;
    const { body } = this;
    const opening = this.phase === "opening" || this.phase === "open";
    // Opening, a drop flows to the bar's place and spreads into it over the last stretch;
    // closing, the bar gathers into a drop where it is, then flows to the corner.
    const drop = (to: Box): Box => ({ x: to.x, y: to.y, w: p.size, h: p.size, r: p.size });
    if (opening && !this.spreading) this.spreading = this.phase === "open" || Math.hypot(body.x - this.bar.x, body.y - this.bar.y) <= this.travel * p.spreadAt + 1;
    if (!opening && !this.gathered) this.gathered = Math.abs(body.w - p.size) + Math.abs(body.h - p.size) < p.size * 0.6;
    body.target = opening ? (this.spreading ? this.bar : drop(this.bar)) : this.gathered ? this.blob : { ...drop(body), x: body.target.x, y: body.target.y };
    body.targetMix = opening && this.spreading ? 1 : 0;
    // Opening flows, then spreads; closing gathers, then flows.
    body.posOmega = opening ? omega : omega * p.lag;
    body.sizeOmega = opening ? omega * p.lag : omega;
    body.wobble = p.wobbleAmp * (1 + (p.barWobble - 1) * body.mix);

    if (this.drop) { this.drop.target = this.close; this.drop.wobble = p.wobbleAmp * 0.35; }
    if (this.anchor) {
      // Rounds into a drop (surface tension) while draining through the neck.
      const anchor = this.anchor;
      const drained = Math.max(0, radius(anchor.target) - dt * p.size * 0.9 / Math.max(p.duration, 0.05));
      anchor.target = { ...anchor.target, w: drained, h: drained, r: drained };
      anchor.posOmega = 0; anchor.sizeOmega = omega * Math.sqrt(p.tension);
      anchor.wobble = p.wobbleAmp * 0.5;
    }
    for (const satellite of this.satellites) {
      const into = satellite.into ?? body;
      satellite.target = { x: into.x, y: into.y, w: 0, h: 0, r: 0 };
      satellite.posOmega = omega * 1.1; satellite.sizeOmega = omega * 0.5;
      satellite.targetMix = into.targetMix;
    }

    // Fixed sub-steps keep the stiff springs stable at any frame rate.
    const steps = Math.ceil(dt / (1 / 240));
    for (let index = 0; index < steps; index++) this.integrate(dt / steps, zeta);

    for (const bridge of this.bridges) bridge.age += dt;
    // A neck thins as it lengthens and as it drains; below the threshold it pinches off.
    for (const bridge of [...this.bridges]) {
      if (this.neck(bridge).r >= p.pinch) continue;
      this.bridges.splice(this.bridges.indexOf(bridge), 1);
      this.pinches++;
      const { ax, ay, bx, by } = this.neck(bridge);
      const count = Math.round(p.satellites);
      for (let index = 1; index <= count; index++) {
        const t = index / (count + 1);
        const bead = makeBody({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, w: 0, h: 0, r: 0 }, bridge.a.mix + (bridge.b.mix - bridge.a.mix) * t, this.seed++);
        bead.w = bead.h = bead.r = Math.max(p.pinch * 1.6, 2) * (1 - Math.abs(t - 0.5));
        bead.vx = bridge.b.vx * t; bead.vy = bridge.b.vy * t;
        bead.into = bridge.b;
        this.satellites.push(bead);
      }
      // The snap: the receiving body recoils, and the remnant flows on into it.
      bridge.b.vj += 0.9 / Math.max(p.tension, 0.2);
      if (bridge.a === this.anchor) { this.anchor.into = bridge.b; this.satellites.push(this.anchor); this.anchor = null; }
    }
    // Merged: a satellite inside its body is gone.
    this.satellites = this.satellites.filter(satellite => {
      const into = satellite.into ?? body;
      const inside = Math.hypot(satellite.x - into.x, satellite.y - into.y) < Math.max(radius(into) * 0.5, 2) || radius(satellite) < 0.4;
      return !inside;
    });

    const near = (box: Box, to: Box, slack: number) => Math.abs(box.x - to.x) + Math.abs(box.y - to.y) + Math.abs(box.w - to.w) + Math.abs(box.h - to.h) < slack;
    if (this.phase === "opening" && near(body, this.bar, Math.max(12, this.bar.w * 0.04))) this.phase = "open";
    if (this.phase === "closing" && near(body, this.blob, 10)) this.phase = "closed";
    // The × buds off the bar's right end as the bar arrives.
    const budding = this.phase === "open" || (this.phase === "opening" && this.spreading && near(body, this.bar, Math.max(30, this.bar.w * 0.25)));
    if (budding && !this.drop) {
      const start = { x: this.bar.x + this.bar.w - this.close.w, y: this.bar.y, w: this.close.w * 0.6, h: this.close.w * 0.6, r: this.close.w * 0.6 };
      const drop = makeBody(start, p.closeTint, this.seed++);
      drop.posOmega = omega * 1.2; drop.sizeOmega = omega * 1.2; drop.targetMix = p.closeTint;
      this.drop = drop;
      this.bridges.push({ a: this.body, b: drop, age: 0, base: this.close.w, life: p.duration * 0.4 });
    }
    if (this.drop) this.drop.targetMix = p.closeTint;
  }

  /** The neck between two bodies: a capsule from core to core, thinning with gap and age. */
  neck(bridge: Bridge) {
    const [ax, ay] = core(bridge.a, bridge.b.x, bridge.b.y);
    const [bx, by] = core(bridge.b, ax, ay);
    const ra = Math.min(bridge.a.r, radius(bridge.a));
    const rb = Math.min(bridge.b.r, radius(bridge.b));
    const gap = Math.max(0, Math.hypot(bx - ax, by - ay) - ra - rb);
    const p = this.params;
    const r = Math.min(bridge.base, ra, rb) * p.neck / (p.neck + gap) * Math.exp(-bridge.age / Math.max(bridge.life, 0.05));
    return { ax, ay, bx, by, r };
  }

  private integrate(dt: number, zeta: number) {
    const p = this.params;
    const jiggleOmega = 14 * Math.sqrt(Math.max(p.tension, 0.05));
    for (const item of this.bodies()) {
      const { target } = item;
      const vx0 = item.vx, vy0 = item.vy;
      [item.x, item.vx] = spring(item.x, item.vx, target.x, item.posOmega, zeta, dt);
      [item.y, item.vy] = spring(item.y, item.vy, target.y, item.posOmega, zeta, dt);
      // Sizes spring in log space: overshoot is a ratio, so a shrinking bar never inverts.
      // Sizes damp more: a wide bar overshooting reads as a glitch, not a wobble (the jiggle wobbles).
      [item.w, item.vw] = logSpring(item.w, item.vw, target.w, item.sizeOmega, zeta + 0.3, dt);
      [item.h, item.vh] = logSpring(item.h, item.vh, target.h, item.sizeOmega, zeta + 0.3, dt);
      [item.r, item.vr] = spring(item.r, item.vr, target.r, item.sizeOmega * Math.sqrt(p.tension), zeta, dt);
      [item.mix, item.vmix] = spring(item.mix, item.vmix, item.targetMix, item.sizeOmega * 2.5, 1, dt);
      // Braking along x squashes it wide, braking along y tall: the arrival wobble.
      const ax = (item.vx - vx0) / dt, ay = (item.vy - vy0) / dt;
      item.vj += (Math.abs(ax) - Math.abs(ay)) * 0.00002 * p.stretch * dt * 60;
      [item.j, item.vj] = spring(item.j, item.vj, 0, jiggleOmega, zeta * 0.6, dt);
      item.j = Math.max(-0.35, Math.min(0.35, item.j));
      item.w = Math.max(0, item.w); item.h = Math.max(0, item.h); item.r = Math.max(0, item.r);
    }
  }

  private *bodies() {
    yield this.body;
    if (this.anchor) yield this.anchor;
    if (this.drop) yield this.drop;
    yield* this.satellites;
  }

  /** Every shape to draw, in CSS pixels. */
  shapes(): Shape[] {
    const p = this.params;
    const out: Shape[] = [];
    for (const item of this.bodies()) {
      const speed = Math.hypot(item.vx, item.vy);
      const round = radius(item) / Math.max(item.w, item.h, 1e-3);
      out.push({
        x: item.x, y: item.y,
        w: item.w * (1 + item.j), h: item.h * (1 - item.j), r: item.r,
        wobble: item.wobble, mix: item.mix, seed: item.seed, segment: false,
        stretch: Math.min(0.8, speed * p.stretch / 2400) * round,
        dx: speed ? item.vx / speed : 1, dy: speed ? item.vy / speed : 0,
      });
    }
    for (const bridge of this.bridges) {
      const { ax, ay, bx, by, r } = this.neck(bridge);
      out.push({ x: ax, y: ay, w: bx, h: by, r, wobble: 0, mix: (bridge.a.mix + bridge.b.mix) / 2, stretch: 0, dx: 1, dy: 0, seed: 0, segment: true });
    }
    return out.slice(0, MAX);
  }

  /** How far each part has arrived, 0–1: the DOM content fades in on these. */
  arrival() {
    const { body } = this;
    const distance = (to: Box) => Math.abs(body.x - to.x) + Math.abs(body.y - to.y) + Math.abs(body.w - to.w) + Math.abs(body.h - to.h);
    const opening = this.phase === "opening" || this.phase === "open";
    const ramp = (value: number, span: number) => Math.max(0, Math.min(1, 1 - value / span));
    const drop = this.drop && !this.bridges.some(bridge => bridge.b === this.drop) ? ramp(Math.abs(this.drop.x - this.close.x) + Math.abs(this.drop.y - this.close.y) + Math.abs(this.drop.w - this.close.w), 10) : 0;
    return {
      bar: opening ? ramp(distance(this.bar), Math.max(60, this.bar.w * 0.15)) : 0,
      blob: opening ? 0 : ramp(distance(this.blob), 24),
      close: opening ? drop : 0,
    };
  }

  /** At rest: nothing left to settle but the idle wobble. */
  settled() {
    return (this.phase === "open" || this.phase === "closed") && !this.anchor && !this.satellites.length && !this.bridges.length
      && Math.hypot(this.body.vx, this.body.vy) < 0.5 && Math.hypot(this.body.vw, this.body.vh) < 0.02 && Math.abs(this.body.vj) < 0.01;
  }
}

const MAX = 12;

const vertex = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr, uTime, uGoo, uGloss, uShadow;
uniform vec3 uBlob, uBar, uLine;
uniform int uCount;
uniform vec4 uBox[${MAX}];
uniform vec4 uMeta[${MAX}];
uniform vec4 uDir[${MAX}];
out vec4 outColor;

float sdBox(vec2 q, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  q = abs(q) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  float d = 1e5;
  float m = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec4 B = uBox[i], M = uMeta[i], D = uDir[i];
    float di;
    if (D.w > 0.5) {
      if (M.x <= 0.05) continue;
      di = sdSegment(p, B.xy, B.zw, M.x);
    } else {
      if (min(B.z, B.w) <= 0.05) continue;
      vec2 q = p - B.xy;
      float s = M.w;
      float along = dot(q, D.xy);
      vec2 across = q - along * D.xy;
      q = D.xy * (along / (1.0 + s)) + across * sqrt(1.0 + s);
      di = sdBox(q, B.zw, M.x);
      if (M.y > 0.0) {
        float a = atan(q.y, q.x);
        float t = uTime + D.z * 1.7;
        di -= M.y * (0.5 * sin(2.0 * a + t * 0.9) + 0.32 * sin(3.0 * a - t * 1.3 + 1.0) + 0.18 * sin(5.0 * a + t * 2.1 + 2.0) + 0.25 * sin(t * 0.7));
      }
    }
    float h = clamp(0.5 + 0.5 * (d - di) / uGoo, 0.0, 1.0);
    d = mix(d, di, h) - uGoo * h * (1.0 - h);
    m = mix(m, M.z, h);
  }
  float px = 1.0 / uDpr;
  float alpha = clamp(0.5 - d / px, 0.0, 1.0);
  vec3 color = mix(uBlob, uBar, m);
  // A jelly highlight: light from the top left along the rim, shade bottom right.
  vec2 g = vec2(dFdx(d), -dFdy(d));
  vec2 n = length(g) > 1e-5 ? normalize(g) : vec2(0.0);
  float rim = smoothstep(9.0, 0.0, -d);
  float gloss = uGloss * (1.0 - 0.85 * m);
  color += vec3(1.0) * pow(max(dot(n, normalize(vec2(-0.55, -0.85))), 0.0), 3.0) * rim * gloss * 0.55;
  color *= 1.0 - max(dot(n, normalize(vec2(0.55, 0.85))), 0.0) * rim * gloss * 0.22;
  // The bar's 1px border.
  color = mix(color, uLine, m * (1.0 - smoothstep(0.0, 1.0, abs(d + 0.5))));
  float shadow = uShadow * (1.0 - alpha) * exp(-max(d - 1.0, 0.0) / 5.0) * mix(0.12, 0.12, m);
  outColor = vec4(color * alpha, alpha + shadow * (1.0 - alpha));
}`;

export type LiquidColors = { blob: [number, number, number]; bar: [number, number, number]; line: [number, number, number] };

/** Draws a sim's shapes on a full-viewport canvas; work is scissored to the shapes' bounds. */
export function liquidRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "liquid shader");
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "liquid program");
  gl.useProgram(program);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = { res: at("uRes"), dpr: at("uDpr"), time: at("uTime"), goo: at("uGoo"), gloss: at("uGloss"), shadow: at("uShadow"), blob: at("uBlob"), bar: at("uBar"), line: at("uLine"), count: at("uCount"), box: at("uBox"), meta: at("uMeta"), dir: at("uDir") };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const box = new Float32Array(MAX * 4), meta = new Float32Array(MAX * 4), dir = new Float32Array(MAX * 4);

  return {
    draw(shapes: Shape[], params: LiquidParams, colors: LiquidColors, time: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = innerWidth, height = innerHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!shapes.length) return;
      // Only the pixels near a shape run the shader.
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const shape of shapes) {
        const [x0, y0, x1, y1] = shape.segment
          ? [Math.min(shape.x, shape.w) - shape.r, Math.min(shape.y, shape.h) - shape.r, Math.max(shape.x, shape.w) + shape.r, Math.max(shape.y, shape.h) + shape.r]
          : [shape.x - shape.w * 1.8, shape.y - shape.h * 1.8, shape.x + shape.w * 1.8, shape.y + shape.h * 1.8];
        left = Math.min(left, x0); top = Math.min(top, y0); right = Math.max(right, x1); bottom = Math.max(bottom, y1);
      }
      const pad = params.goo + params.wobbleAmp * 2 + 24;
      left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(width, right + pad); bottom = Math.min(height, bottom + pad);
      if (right <= left || bottom <= top) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(left * dpr), Math.floor((height - bottom) * dpr), Math.ceil((right - left) * dpr), Math.ceil((bottom - top) * dpr));
      shapes.forEach((shape, index) => {
        box.set([shape.x, shape.y, shape.w, shape.h], index * 4);
        meta.set([shape.r, shape.wobble, shape.mix, shape.stretch], index * 4);
        dir.set([shape.dx, shape.dy, shape.seed, shape.segment ? 1 : 0], index * 4);
      });
      gl.uniform2f(u.res, width, height);
      gl.uniform1f(u.dpr, dpr);
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.goo, Math.max(params.goo, 0.5));
      gl.uniform1f(u.gloss, params.gloss);
      gl.uniform1f(u.shadow, params.shadow);
      gl.uniform3fv(u.blob, colors.blob);
      gl.uniform3fv(u.bar, colors.bar);
      gl.uniform3fv(u.line, colors.line);
      gl.uniform1i(u.count, shapes.length);
      gl.uniform4fv(u.box, box);
      gl.uniform4fv(u.meta, meta);
      gl.uniform4fv(u.dir, dir);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

/** Any CSS colour (tokens, oklch…) as linear-ish 0–1 sRGB, by painting one pixel. */
export function cssColor(value: string): [number, number, number] {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) return [0, 0, 0];
  context.fillStyle = "#000";
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
