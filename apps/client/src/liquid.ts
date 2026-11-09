// The liquid Coach button: a small spring simulation of soft shapes (pure, tested
// in liquid.test.ts) drawn by one WebGL2 signed-distance shader. Shapes join with
// a smooth minimum ("goo"); a stretching capsule between two shapes is the neck
// that thins as it lengthens and drains, and pinches off below a threshold into
// optional beads. The button in the corner (the home drop) always stays: opening,
// one drop flows out of it on a thick neck and spreads into the bar; when the neck
// snaps, the thread left on the button retracts into it, gathering its length into
// a growing tip. From first contact that liquid's momentum carries on into the
// button, leaning it the way the liquid travelled, until surface tension and
// viscosity stop it and it creeps back: one continuous motion. Closing, the bar
// gathers into one drop that flows back in the same way. This lean is its own
// motion, apart from the idle surface wobble.
//
// The liquid is thick (honey, not water), and the motion follows how such
// liquids behave:
// - Above an Ohnesorge number of about 0.77, a drop's shape no longer oscillates;
//   it creeps back to round (aperiodic). So every spring here is overdamped
//   (viscosity is the damping ratio, default above 1): nothing bounces or overshoots.
// - Viscous friction eats the surface energy, so shapes relax slowly, on the
//   visco-capillary time (viscosity × radius / surface tension), and drops merge slowly.
// - A viscous neck thins linearly in time into a long thread, with no satellite drops.
// - A broken viscous thread retracts by speeding up gradually, then slowing; no rebound.

export type LiquidParams = {
  /** The button's radius, px. */
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
  /** The drop that flows out, as a fraction of the button. */
  flow: number;
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
  /** How far liquid flowing into the button leans it (its share of the mass, scaled). */
  recoil: number;
  /** Seconds for liquid flowing in to come to rest and join the button. */
  settle: number;
  gloss: number;
  shadow: number;
  /** A glint travelling around the open bar's rim (as on macOS notifications): strength, and seconds per lap. */
  shine: number;
  shineLap: number;
  blobColor: string;
};

export const liquidDefaults: LiquidParams = {
  size: 24, duration: 0.45, tension: 1, viscosity: 1.4, lag: 0.8, spreadAt: 0.35, flow: 1,
  wobbleSpeed: 0.45, wobbleAmp: 1.8, barWobble: 0.15, stretch: 1,
  goo: 20, neck: 7, pinch: 1.2, satellites: 0, recoil: 1.5, settle: 1.2,
  gloss: 0.55, shadow: 0.45, shine: 0.7, shineLap: 6,
  blobColor: "#dc4c3e",
};

/** A rounded box: centre, half size, corner radius. */
export type Box = { x: number; y: number; w: number; h: number; r: number };
export type Targets = { blob: Box; bar: Box };

type Body = Box & {
  vx: number; vy: number; vw: number; vh: number; vr: number;
  /** The jiggle: width grows while height shrinks, and back. */
  j: number; vj: number;
  /** 0 = blob colour, 1 = bar colour. */
  mix: number; vmix: number;
  target: Box; targetMix: number;
  posOmega: number; sizeOmega: number;
  wobble: number; seed: number;
  /** Flowing into the button and past first contact: its momentum carries on until it is stopped. */
  absorbing?: boolean;
  /** A retracting thread's tip: the thread's radius, and the volume (tip + thread) it gathers. */
  thread?: number; volume?: number;
  /** Driven toward (x, y) at a terminal speed, px/s (a retracting thread, a drop flowing home). */
  drive?: { x: number; y: number; speed: number };
  /** Extra viscous braking, 1/s, from first contact (liquid ploughing into the button). */
  drag?: number;
  /** Merges into this body and disappears once inside. */
  into?: Body;
};
/** `life`: seconds for the neck to thin away. `tail`: a broken thread still on `a`, of this fixed radius. */
type Bridge = { a: Body; b: Body; age: number; base: number; life: number; tail?: number };
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
const round = (x: number, y: number, r: number): Box => ({ x, y, w: r, h: r, r });
/** The closest point to (x, y) on a box's core (the box shrunk by its corner radius). */
const core = (box: Box, x: number, y: number): [number, number] => {
  const r = Math.min(box.r, box.w, box.h);
  return [Math.max(box.x - box.w + r, Math.min(box.x + box.w - r, x)), Math.max(box.y - box.h + r, Math.min(box.y + box.h - r, y))];
};
const near = (box: Box, to: Box, slack: number) => Math.abs(box.x - to.x) + Math.abs(box.y - to.y) + Math.abs(box.w - to.w) + Math.abs(box.h - to.h) < slack;

export class LiquidSim {
  params: LiquidParams;
  phase: Phase = "closed";
  /** The button in the corner: always there (the × while open). */
  home: Body;
  /** The bar's liquid, from leaving the button until it flows back in. */
  body: Body | null = null;
  bridges: Bridge[] = [];
  satellites: Body[] = [];
  /** Counts pinch-offs (tests, and the lab's readout). */
  pinches = 0;
  private blob: Box;
  private bar: Box;
  private seed = 1;
  private absorbDamping = 0;
  private travel = 0;
  private spreading = false;
  private gathered = false;

  constructor(params: LiquidParams, targets: Targets) {
    this.params = params;
    this.blob = targets.blob; this.bar = targets.bar;
    this.home = makeBody(this.blob, 0, 0);
  }

  setTargets(targets: Targets) {
    this.blob = targets.blob; this.bar = targets.bar;
  }

  setOpen(open: boolean) {
    if (open === (this.phase === "opening" || this.phase === "open")) return;
    const p = this.params;
    this.phase = open ? "opening" : "closing";
    this.spreading = false; this.gathered = false;
    const { home } = this;
    if (open) {
      // A drop wells out of the button, joined to it by a neck.
      if (!this.body) {
        const body = makeBody(round(home.x, home.y, p.size * p.flow), 0, this.seed++);
        this.body = body;
        this.bridges.push({ a: home, b: body, age: 0, base: p.size * p.flow, life: p.duration * 1.4 });
      }
      this.travel = Math.hypot(this.body.x - this.bar.x, this.body.y - this.bar.y);
      return;
    }
    if (!this.body) this.phase = "closed";
  }

  /** First contact: the liquid ploughs on through the button and is braked to a stop past its centre. */
  private absorb(item: Body) {
    item.absorbing = true;
    item.drive = undefined;
    const through = Math.hypot(item.x - this.home.x, item.y - this.home.y) + this.params.size * 0.6 * this.params.recoil;
    // Total braking (this drag plus the pull-back spring's own damping) stops it `through` px on.
    item.drag = Math.max(0, Math.hypot(item.vx, item.vy) / Math.max(through, 1) - this.absorbDamping);
  }

  /** The button's lean: the shift of the shared centre of mass while liquid flows into it. */
  lean() {
    const { home } = this;
    let mass = radius(home) ** 2, x = 0, y = 0;
    const incoming = this.body && !(this.phase === "opening" || this.phase === "open") ? [...this.satellites, this.body] : this.satellites;
    for (const item of incoming) {
      if ((item.into ?? home) !== home && item !== this.body) continue;
      // Counts in smoothly by proximity, the same across first contact: no jump.
      const reach = radius(home) + radius(item) + this.params.goo;
      const joined = Math.max(0, 1 - Math.hypot(item.x - home.x, item.y - home.y) / reach) ** 2;
      const m = radius(item) ** 2 * joined;
      mass += m; x += m * (item.x - home.x); y += m * (item.y - home.y);
    }
    return { x: x / mass * this.params.recoil, y: y / mass * this.params.recoil };
  }

  step(dt: number) {
    const p = this.params;
    const omega = 4.6 / Math.max(p.duration, 0.05);
    const zeta = p.viscosity;
    const { home, body } = this;
    const opening = this.phase === "opening" || this.phase === "open";
    home.target = this.blob; home.targetMix = 0;
    home.posOmega = omega * 2; home.sizeOmega = omega;
    home.wobble = p.wobbleAmp;

    if (body) {
      // Opening, the drop flows to the bar's place and spreads into it over the last stretch;
      // closing, the bar gathers into a drop where it is, then flows back into the button.
      const drop = p.size * p.flow;
      if (opening && !this.spreading) this.spreading = this.phase === "open" || Math.hypot(body.x - this.bar.x, body.y - this.bar.y) <= this.travel * p.spreadAt + 1;
      if (!opening && !this.gathered) this.gathered = Math.abs(body.w - drop) + Math.abs(body.h - drop) < drop * 0.8;
      body.target = opening ? (this.spreading ? this.bar : round(this.bar.x, this.bar.y, drop))
        : this.gathered ? round(home.x, home.y, drop) : round(body.target.x, body.target.y, drop);
      // Gathered, the drop flows home at a steady speed and arrives with its momentum.
      body.drive = !opening && this.gathered ? { x: home.x, y: home.y, speed: 8 * p.size / Math.max(p.duration, 0.05) } : undefined;
      body.targetMix = opening && this.spreading ? 1 : 0;
      // Opening flows, then spreads; closing gathers, then flows.
      body.posOmega = body.drive ? 0 : opening ? omega : omega * p.lag;
      body.sizeOmega = opening ? omega * p.lag : omega;
      body.wobble = p.wobbleAmp * (1 + (p.barWobble - 1) * body.mix);
    }
    // Liquid joining the button slows over `settle` seconds without swinging (overdamped, slow mode).
    const thick = Math.max(zeta, 1);
    const absorb = 1 / (Math.max(p.settle, 0.05) * (thick - Math.sqrt(thick * thick - 1)));
    this.absorbDamping = 2 * zeta * absorb;
    for (const satellite of this.satellites) {
      const into = satellite.into ?? home;
      satellite.targetMix = into.targetMix;
      if (into !== home) { satellite.target = round(into.x, into.y, 0); satellite.posOmega = omega * 0.8; satellite.sizeOmega = omega * 0.4; continue; }
      const gap = Math.hypot(satellite.x - home.x, satellite.y - home.y) - radius(home);
      // A retracting thread gathers its length into the tip: the tip grows as the thread shortens.
      if (satellite.volume && satellite.thread && !satellite.absorbing) {
        const grown = Math.sqrt(Math.max(satellite.volume - 2 * satellite.thread * Math.max(gap, 0), 0) / Math.PI);
        satellite.w = satellite.h = satellite.r = Math.max(grown, satellite.w);
      }
      // First contact: from here its momentum carries it on into the button until surface
      // tension (the pull to the centre) and viscosity stop it, while it joins the button.
      if (!satellite.absorbing && gap < radius(satellite) * 0.5) this.absorb(satellite);
      satellite.target = round(home.x, home.y, satellite.absorbing ? 0 : radius(satellite));
      // Before contact a thread retracts at a steady speed (it does not brake on approach).
      if (!satellite.absorbing) satellite.drive = { x: home.x, y: home.y, speed: 5 * p.size / Math.max(p.duration, 0.05) };
      satellite.posOmega = satellite.absorbing ? absorb : 0;
      // It keeps its volume while it still moves, and joins the button once stopped.
      const moving = Math.min(1, Math.hypot(satellite.vx, satellite.vy) / (p.size * 2));
      satellite.sizeOmega = satellite.absorbing ? absorb * 1.2 * (1 - moving) : omega;
    }

    // Fixed sub-steps keep the stiff springs stable at any frame rate.
    const steps = Math.ceil(dt / (1 / 240));
    for (let index = 0; index < steps; index++) this.integrate(dt / steps, zeta);

    for (const bridge of this.bridges) bridge.age += dt;
    // A neck thins as it lengthens and as it drains; below the threshold it pinches off.
    for (const bridge of [...this.bridges]) {
      if (bridge.tail || this.neck(bridge).r >= p.pinch) continue;
      this.bridges.splice(this.bridges.indexOf(bridge), 1);
      this.pinches++;
      const { ax, ay, bx, by } = this.neck(bridge);
      const count = Math.round(p.satellites);
      for (let index = 1; index <= count; index++) {
        const t = index / (count + 1);
        const bead = makeBody(round(ax + (bx - ax) * t, ay + (by - ay) * t, Math.max(p.pinch * 1.6, 2) * (1 - Math.abs(t - 0.5))), bridge.a.mix + (bridge.b.mix - bridge.a.mix) * t, this.seed++);
        bead.vx = bridge.b.vx * t; bead.vy = bridge.b.vy * t;
        // A broken thread's beads fall back to the nearer end.
        bead.into = t < 0.5 ? bridge.a : bridge.b;
        this.satellites.push(bead);
      }
      // The snap: the drop recoils, and the neck's stub runs back into the button with the energy.
      bridge.b.vj += 0.9 / Math.max(p.tension, 0.2);
      if (bridge.a === home) {
        // A viscous thread breaks near the drop; the length left on the button retracts into it
        // as a thread with a swollen tip, speeding up and then slowing (no rebound).
        const dx = bx - home.x, dy = by - home.y, length = Math.hypot(dx, dy) || 1;
        const out = radius(home) + Math.max(0, length - radius(home) - radius(bridge.b)) * 0.7;
        const thread = Math.max(p.pinch, 1);
        const tip = makeBody(round(home.x + dx / length * out, home.y + dy / length * out, thread * 2.2), home.mix, this.seed++);
        tip.into = home;
        tip.thread = thread;
        tip.volume = Math.PI * (thread * 2.2) ** 2 + 2 * thread * (out - radius(home));
        this.satellites.push(tip);
        this.bridges.push({ a: home, b: tip, age: 0, base: thread, life: 1, tail: thread });
      }
    }
    // Back home: at first contact the closing drop starts joining the button, its momentum carrying on.
    if (body && !opening && this.gathered && Math.hypot(body.x - home.x, body.y - home.y) - radius(home) < radius(body) * 0.5) {
      this.body = null;
      body.into = home;
      this.absorb(body);
      this.satellites.push(body);
      for (const satellite of this.satellites) if (satellite.into === body) satellite.into = home;
      this.phase = "closed";
    }
    // Joined: liquid that has flowed into the button is gone; a bead inside its body too.
    this.satellites = this.satellites.filter(satellite => {
      if (satellite.absorbing) return radius(satellite) >= 0.5;
      const into = satellite.into ?? home;
      return Math.hypot(satellite.x - into.x, satellite.y - into.y) >= Math.max(radius(into) * 0.5, 2) && radius(satellite) >= 0.4;
    });
    // A thread goes once its tip has reached the button.
    this.bridges = this.bridges.filter(bridge => !bridge.tail || (this.satellites.includes(bridge.b) && !bridge.b.absorbing));
    if (this.phase === "opening" && this.body && near(this.body, this.bar, Math.max(12, this.bar.w * 0.04))) this.phase = "open";
  }

  /** The neck between two bodies: a capsule from core to core, thinning with gap and age. */
  neck(bridge: Bridge) {
    const [ax, ay] = core(bridge.a, bridge.b.x, bridge.b.y);
    const [bx, by] = core(bridge.b, ax, ay);
    if (bridge.tail) return { ax, ay, bx, by, r: bridge.tail };
    const ra = Math.min(bridge.a.r, radius(bridge.a));
    const rb = Math.min(bridge.b.r, radius(bridge.b));
    const gap = Math.max(0, Math.hypot(bx - ax, by - ay) - ra - rb);
    const p = this.params;
    const r = Math.min(bridge.base, ra, rb) * p.neck / (p.neck + gap) * Math.max(0, 1 - bridge.age / Math.max(bridge.life, 0.05));
    return { ax, ay, bx, by, r };
  }

  private integrate(dt: number, zeta: number) {
    const p = this.params;
    const jiggleOmega = 14 * Math.sqrt(Math.max(p.tension, 0.05));
    for (const item of this.bodies()) {
      const { target } = item;
      if (item.drive) {
        // Terminal-speed flow: velocity relaxes toward the drive (speeds up, then steady).
        const dx = item.drive.x - item.x, dy = item.drive.y - item.y, length = Math.hypot(dx, dy) || 1;
        const relax = Math.min(1, dt / 0.15);
        item.vx += (dx / length * item.drive.speed - item.vx) * relax;
        item.vy += (dy / length * item.drive.speed - item.vy) * relax;
      }
      if (item.drag) { const keep = Math.exp(-item.drag * dt); item.vx *= keep; item.vy *= keep; }
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
      if (item !== this.home) item.vj += (Math.abs(ax) - Math.abs(ay)) * 0.00001 * p.stretch * dt * 60;
      [item.j, item.vj] = spring(item.j, item.vj, 0, jiggleOmega, zeta, dt);
      item.j = Math.max(-0.35, Math.min(0.35, item.j));
      item.w = Math.max(0, item.w); item.h = Math.max(0, item.h); item.r = Math.max(0, item.r);
    }
  }

  private *bodies() {
    yield this.home;
    if (this.body) yield this.body;
    yield* this.satellites;
  }

  /** Every shape to draw, in CSS pixels. */
  shapes(): Shape[] {
    const p = this.params;
    const out: Shape[] = [];
    const lean = this.lean(), leaning = Math.hypot(lean.x, lean.y);
    for (const item of this.bodies()) {
      const speed = Math.hypot(item.vx, item.vy);
      const roundness = radius(item) / Math.max(item.w, item.h, 1e-3);
      // The button leans with the shared centre of mass and draws out along it.
      const leans = item === this.home && leaning > 0.05;
      out.push({
        x: item.x + (item === this.home ? lean.x : 0), y: item.y + (item === this.home ? lean.y : 0),
        w: item.w * (1 + item.j), h: item.h * (1 - item.j), r: item.r,
        wobble: item.wobble, mix: item.mix, seed: item.seed, segment: false,
        stretch: leans ? Math.min(0.5, leaning / Math.max(item.w, 1) * 0.9) : Math.min(0.8, speed * p.stretch / 2400) * roundness,
        dx: leans ? lean.x / leaning : speed ? item.vx / speed : 1, dy: leans ? lean.y / leaning : speed ? item.vy / speed : 0,
      });
    }
    for (const bridge of this.bridges) {
      const { ax, ay, bx, by, r } = this.neck(bridge);
      out.push({ x: ax, y: ay, w: bx, h: by, r, wobble: 0, mix: (bridge.a.mix + bridge.b.mix) / 2, stretch: 0, dx: 1, dy: 0, seed: 0, segment: true });
    }
    return out.slice(0, MAX);
  }

  /** How far the bar has arrived, 0–1: its content fades in on this, and out at once on closing. */
  arrival() {
    const { body } = this;
    if (!body || !(this.phase === "opening" || this.phase === "open")) return 0;
    const distance = Math.abs(body.x - this.bar.x) + Math.abs(body.y - this.bar.y) + Math.abs(body.w - this.bar.w) + Math.abs(body.h - this.bar.h);
    return Math.max(0, Math.min(1, 1 - distance / Math.max(60, this.bar.w * 0.15)));
  }

  /** At rest: nothing left to settle but the idle wobble. */
  settled() {
    const { body } = this;
    return (this.phase === "open" || this.phase === "closed") && !this.satellites.length && !this.bridges.length
      && (!body || (Math.hypot(body.vx, body.vy) < 0.5 && Math.hypot(body.vw, body.vh) < 0.02 && Math.abs(body.vj) < 0.01));
  }
}

const MAX = 12;

const vertex = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr, uTime, uGoo, uGloss, uShadow, uShine, uShinePhase;
uniform vec4 uBarBox;
uniform vec3 uShineColor;
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
  float rimLine = 1.0 - smoothstep(0.0, 1.0, abs(d + 0.5));
  color = mix(color, uLine, m * rimLine);
  // The shine: a soft glint running around the bar's rim. Position along the rim: x
  // along the top edge, then back along the bottom (continuous around the ends).
  if (uShine > 0.0) {
    vec2 q = p - uBarBox.xy;
    float lap = 4.0 * uBarBox.z;
    float along = q.y < 0.0 ? q.x + uBarBox.z : lap * 0.5 + uBarBox.z - q.x;
    float gap = abs(mod(along - uShinePhase * lap + lap * 0.5, lap) - lap * 0.5);
    float glint = exp(-pow(gap / (lap * 0.07), 2.0));
    float rim = 1.0 - smoothstep(0.0, 2.2, abs(d + 0.9));
    color = mix(color, uShineColor, m * uShine * rim * (0.18 + 0.82 * glint));
  }
  float shadow = uShadow * (1.0 - alpha) * exp(-max(d - 1.0, 0.0) / 5.0) * mix(0.12, 0.12, m);
  outColor = vec4(color * alpha, alpha + shadow * (1.0 - alpha));
}`;

export type LiquidColors = { blob: [number, number, number]; bar: [number, number, number]; line: [number, number, number]; shine: [number, number, number] };

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
  const u = { res: at("uRes"), dpr: at("uDpr"), time: at("uTime"), goo: at("uGoo"), gloss: at("uGloss"), shadow: at("uShadow"), shine: at("uShine"), shinePhase: at("uShinePhase"), barBox: at("uBarBox"), shineColor: at("uShineColor"), blob: at("uBlob"), bar: at("uBar"), line: at("uLine"), count: at("uCount"), box: at("uBox"), meta: at("uMeta"), dir: at("uDir") };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const box = new Float32Array(MAX * 4), meta = new Float32Array(MAX * 4), dir = new Float32Array(MAX * 4);

  return {
    /** `shine`: the glint around `bar` (0 hides it), at `phase` (0–1) of its lap. */
    draw(shapes: Shape[], params: LiquidParams, colors: LiquidColors, time: number, glint: { bar: Box; shine: number; phase: number }) {
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
      gl.uniform1f(u.shine, glint.shine);
      gl.uniform1f(u.shinePhase, glint.phase);
      gl.uniform4f(u.barBox, glint.bar.x, glint.bar.y, glint.bar.w, glint.bar.h);
      gl.uniform3fv(u.shineColor, colors.shine);
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
