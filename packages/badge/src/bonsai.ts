// Procedural bonsai for the member badge. A member number always gives the same tree:
// number → traits (bonsaiTraits) → geometry (buildBonsai). Geometry only; badge-scene.ts
// draws it in the sliced-ink style from docs/badge/mockups/round-3.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const BONSAI_STYLES = ["upright", "slant", "windswept", "cascade", "literati", "broom", "twin"] as const;
export type BonsaiStyle = (typeof BONSAI_STYLES)[number];
export const BONSAI_POTS = ["none", "slab", "oval", "rect", "round", "tall"] as const;
export type BonsaiPot = (typeof BONSAI_POTS)[number];

export type BonsaiTraits = {
  style: BonsaiStyle;
  pot: BonsaiPot;
  /** trunk height, scene units */
  height: number;
  /** trunk lean, radians (sign = side) */
  lean: number;
  /** S-curve amplitude of the trunk, as a share of its height */
  sway: number;
  /** S-curve frequency */
  bends: number;
  /** trunk radius at the base */
  girth: number;
  /** foliage pads, apex included */
  pads: number;
  /** base pad radius */
  padSize: number;
  /** bare, bleached branches (jin) */
  deadwood: number;
  /** surface roots */
  roots: number;
  /** wind / cascade side */
  side: 1 | -1;
  /** yaw of the whole tree, radians */
  turn: number;
  /** key light azimuth, radians */
  light: number;
  /** drifting dots and dashes */
  particles: number;
  /** where the single red dash sits, 0…1 of the scene box */
  red: [number, number];
  /** free entropy for per-branch jitter */
  grain: number;
};

/** Integer hash (lowbias32), so neighbouring member numbers don't give neighbouring trees. */
export function hashSeed(n: number): number {
  let x = (Math.floor(n) ^ 0x9e3779b9) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, weighted: readonly (readonly [T, number])[]): T => {
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  let x = r() * total;
  for (const [value, w] of weighted) if ((x -= w) < 0) return value;
  return weighted[weighted.length - 1][0];
};
const range = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();

export function bonsaiTraits(member: number, style?: BonsaiStyle): BonsaiTraits {
  const r = rng(hashSeed(member));
  const picked = pick(r, [["upright", 22], ["slant", 18], ["windswept", 12], ["cascade", 9], ["literati", 10], ["broom", 12], ["twin", 17]] as const);
  style ??= picked;
  const side: 1 | -1 = r() < 0.5 ? -1 : 1;
  const base: BonsaiTraits = {
    style, side,
    pot: pick(r, [["none", 30], ["slab", 18], ["oval", 20], ["rect", 18], ["round", 14]] as const),
    height: range(r, 0.85, 1.1),
    lean: side * range(r, 0, 0.1),
    sway: range(r, 0.06, 0.16),
    bends: range(r, 1.4, 2.6),
    girth: range(r, 0.06, 0.09),
    pads: Math.round(range(r, 6, 10)),
    padSize: range(r, 0.2, 0.27),
    deadwood: r() < 0.35 ? 1 + Math.floor(r() * 2) : 0,
    roots: Math.round(range(r, 6, 10)),
    turn: range(r, 0, Math.PI * 2),
    light: range(r, -0.9, 0.9),
    particles: Math.round(range(r, 14, 30)),
    red: [range(r, 0.12, 0.32) * (r() < 0.5 ? 1 : -1) + 0.5, range(r, 0.38, 0.62)],
    grain: r(),
  };
  switch (style) {
    case "slant": return { ...base, lean: side * range(r, 0.22, 0.38) };
    case "windswept": return { ...base, lean: side * range(r, 0.25, 0.4), deadwood: Math.max(1, base.deadwood), pads: Math.round(range(r, 5, 8)) };
    case "cascade": return { ...base, pot: "tall", pads: Math.round(range(r, 6, 8)), roots: 0 };
    case "literati": return { ...base, height: range(r, 1.5, 1.8), sway: range(r, 0.12, 0.2), bends: range(r, 2.4, 3.4), girth: range(r, 0.03, 0.04), pads: Math.round(range(r, 1, 3)), padSize: range(r, 0.16, 0.2), pot: r() < 0.5 ? "round" : "none", particles: Math.round(range(r, 8, 14)) };
    case "broom": return { ...base, height: range(r, 0.8, 0.95), lean: 0, sway: 0.02, pot: r() < 0.5 ? "round" : "oval", deadwood: 0 };
    case "twin": return { ...base, pads: Math.round(range(r, 7, 10)) };
    default: return base;
  }
}

// ---------------------------------------------------------------- geometry

/** Parts by ink tone: badge-scene gives each its own density. */
export type BonsaiGeometry = {
  bark: THREE.BufferGeometry;
  dead: THREE.BufferGeometry | null;
  pot: THREE.BufferGeometry | null;
  /** foliage tufts, one matrix each, for an InstancedMesh */
  tufts: THREE.Matrix4[];
  /** y of the surface the tree stands on */
  groundY: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A tube along points with a tapering radius (and a flared base). uv.x runs around, uv.y along. */
function tube(points: THREE.Vector3[], r0: number, r1: number, flare = 0, radial = 9): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const segs = Math.max(6, points.length * 5);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t);
    const r = (r0 + (r1 - r0) * Math.pow(t, 0.8)) * (1 + flare * Math.exp(-t * 9));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Pots are lathes; 4 segments turned 45° make the square ones. Top (soil) at y = 0. */
function pot(kind: BonsaiPot, r: () => number): { geometry: THREE.BufferGeometry | null; groundY: number } {
  const lathe = (w: number, h: number, segments: number, depthScale: number, square = false) => {
    const profile = [v(0, -h, 0), v(w * 0.8, -h, 0), v(w * 0.84, -h * 0.88, 0), v(w * 0.97, -h * 0.18, 0), v(w * 1.04, -h * 0.1, 0), v(w * 1.04, 0, 0), v(w * 0.95, 0, 0), v(w * 0.95, -0.012, 0), v(0, -0.012, 0)]
      .map(p => new THREE.Vector2(p.x, p.y));
    const g = new THREE.LatheGeometry(profile, segments);
    if (square) g.rotateY(Math.PI / 4);
    g.scale(square ? 1.35 : 1, 1, depthScale);
    return { geometry: g, groundY: -h };
  };
  switch (kind) {
    case "none": {
      // a low mound of earth the roots spread over
      const g = new THREE.LatheGeometry([0, 0.12, 0.26, 0.38, 0.46].map((x, i) => new THREE.Vector2(x, 0.03 - [0, 0.006, 0.018, 0.034, 0.05][i])), 28);
      g.scale(1.25, 1, 0.8);
      return { geometry: g, groundY: -0.02 };
    }
    case "slab": {
      const g = new THREE.CylinderGeometry(0.44, 0.47, 0.05, 30, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.07 * Math.sin(a * 3 + r() * 0.4) + 0.04 * Math.sin(a * 7);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) - 0.025, p.getZ(i) * k * 0.62);
      }
      g.computeVertexNormals();
      return { geometry: g, groundY: -0.05 };
    }
    case "oval": return lathe(0.4, 0.09, 32, 0.6);
    case "rect": return lathe(0.3, 0.13, 4, 0.62, true);
    case "round": return lathe(0.2, 0.15, 28, 1);
    case "tall": return lathe(0.13, 0.3, 4, 0.8, true);
  }
}

export function buildBonsai(t: BonsaiTraits): BonsaiGeometry {
  const r = rng(hashSeed(t.grain * 1e9));
  const bark: THREE.BufferGeometry[] = [], dead: THREE.BufferGeometry[] = [], tufts: THREE.Matrix4[] = [];
  const H = t.height, s = t.side;

  const trunkPoints = (height: number, lean: number, sway: number, phase: number, offset = v(0, 0, 0)) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const w = Math.sin(u * Math.PI * t.bends + phase) * sway * height * Math.min(1, u * 3);
      pts.push(v(offset.x + Math.sin(lean) * u * height + w, u * height * Math.cos(lean * 0.6), offset.z + Math.cos(u * Math.PI * t.bends * 0.7 + phase) * sway * height * 0.5 * u));
    }
    return pts;
  };

  // foliage: a dome of tufts, round on top and flat underneath like the reference pads
  const pad = (c: THREE.Vector3, rx: number, flat = 0.5, density = 1) => {
    const ry = rx * flat, rz = rx * 0.78, yaw = r() * Math.PI;
    const n = Math.round(THREE.MathUtils.clamp(rx * rz * 4200, 40, 420) * density);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const lx = Math.cos(a) * d * rx, lz = Math.sin(a) * d * rz;
      const top = ry * Math.sqrt(Math.max(0, 1 - d * d));
      const y = -ry * 0.45 + (top + ry * 0.45) * Math.pow(r(), 0.45);
      const x = lx * Math.cos(yaw) - lz * Math.sin(yaw), z = lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const k = rx * (0.13 + r() * 0.1);
      q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6));
      tufts.push(m.compose(v(c.x + x, c.y + y, c.z + z), q, v(k, k * 0.75, k)).clone());
    }
  };

  // a branch from a point on the trunk out along `dir`, ending in a pad (or bare, for jin)
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, size: number, bare = false) => {
    const tip = from.clone().addScaledVector(dir, length).addScaledVector(UP, length * (bare ? 0.35 : 0.08));
    const mid = from.clone().addScaledVector(dir, length * 0.5).addScaledVector(UP, -length * 0.06 + (r() - 0.5) * 0.04);
    const path = [from, from.clone().addScaledVector(dir, length * 0.2).addScaledVector(UP, 0.02), mid, tip];
    (bare ? dead : bark).push(tube(path, radius, bare ? radius * 0.1 : radius * 0.3, 0, 6));
    if (bare) return;
    // fine twigs fanning into the underside of the pad
    const c = tip.clone().addScaledVector(UP, size * 0.2);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = size * (0.35 + r() * 0.5);
      bark.push(tube([mid.clone().lerp(tip, 0.4), tip, c.clone().add(v(Math.cos(a) * d, -size * 0.08, Math.sin(a) * d * 0.7))], radius * 0.35, radius * 0.08, 0, 4));
    }
    pad(c, size);
  };

  const dirAt = (az: number) => v(Math.cos(az), 0, Math.sin(az));
  const trunks: { pts: THREE.Vector3[]; girth: number; pads: number; from: number }[] = [];

  if (t.style === "cascade") {
    const pts = [v(0, 0, 0), v(s * 0.03, 0.16, 0.02), v(s * 0.12, 0.28, 0), v(s * 0.28, 0.3, -0.03), v(s * 0.4, 0.16, 0), v(s * 0.46, -0.02, 0.03), v(s * 0.5, -0.16, 0), v(s * 0.48, -0.26, 0.02)].map(p => p.multiplyScalar(H));
    trunks.push({ pts, girth: t.girth, pads: t.pads, from: 0.18 });
  } else if (t.style === "twin") {
    trunks.push({ pts: trunkPoints(H, t.lean - s * 0.06, t.sway, t.grain * 6), girth: t.girth, pads: Math.ceil(t.pads * 0.6), from: 0.4 });
    trunks.push({ pts: trunkPoints(H * 0.68, t.lean + s * 0.3, t.sway * 1.2, t.grain * 9, v(s * 0.05, 0, 0.03)), girth: t.girth * 0.72, pads: Math.floor(t.pads * 0.4), from: 0.45 });
  } else {
    const h = t.style === "broom" ? H * 0.42 : H;
    trunks.push({ pts: trunkPoints(h, t.lean, t.sway, t.grain * 6), girth: t.girth * (t.style === "broom" ? 1.2 : 1), pads: t.pads, from: t.style === "literati" ? 0.8 : 0.38 });
  }

  let az = t.turn;
  for (const trunk of trunks) {
    const curve = new THREE.CatmullRomCurve3(trunk.pts, false, "centripetal");
    const isBroom = t.style === "broom";
    bark.push(tube(trunk.pts, trunk.girth, trunk.girth * (isBroom ? 0.55 : t.style === "literati" ? 0.45 : 0.28), 0.9, 12));
    const top = curve.getPointAt(1);

    if (isBroom) {
      // the trunk splits into a fan of fine branches under one dome of foliage
      // a V of main limbs from the top of the short trunk, each forking into twigs that hold the dome
      const crown = top.clone().addScaledVector(UP, H * 0.5);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + r() * 0.4, spread = 0.2 + r() * 0.18;
        const fork = top.clone().add(v(Math.cos(a) * spread * 0.6, H * (0.22 + r() * 0.1), Math.sin(a) * spread * 0.45));
        bark.push(tube([top, top.clone().lerp(fork, 0.5).add(v(0, 0.02, 0)), fork], trunk.girth * 0.42, trunk.girth * 0.2, 0, 6));
        for (let j = 0; j < 3; j++) {
          const b = a + (j - 1) * 0.5 + (r() - 0.5) * 0.3, d = spread + 0.12 + r() * 0.22;
          const end = crown.clone().add(v(Math.cos(b) * d, (r() - 0.7) * 0.12, Math.sin(b) * d * 0.75));
          bark.push(tube([fork, fork.clone().lerp(end, 0.5).add(v(0, 0.03, 0)), end], trunk.girth * 0.2, trunk.girth * 0.04, 0, 4));
        }
      }
      // a thin crown, so the fan of twigs shows through like the reference
      pad(crown.clone().addScaledVector(UP, 0.05), t.padSize * 2.3, 0.42, 0.38);
      continue;
    }

    // apex pad; a cascade carries its crown at the crest and a small pad at the hanging tip
    const cascade = t.style === "cascade";
    const crest = cascade ? trunk.pts.reduce((a, b) => (b.y > a.y ? b : a)) : top;
    pad(crest.clone().addScaledVector(UP, t.padSize * 0.15), t.padSize * (t.style === "literati" ? 1.1 : cascade ? 0.75 : 0.85));
    if (cascade) pad(top.clone().addScaledVector(UP, -0.02), t.padSize * 0.45);
    const n = trunk.pads - 1;
    for (let i = 0; i < n; i++) {
      const u = trunk.from + (0.9 - trunk.from) * (n === 1 ? 0.5 : i / (n - 1)) + (r() - 0.5) * 0.04;
      const at = curve.getPointAt(u);
      az += 2.4 + (r() - 0.5) * 0.6;
      let dir = dirAt(az);
      if (t.style === "windswept" || t.style === "cascade") dir = v(s, 0, (r() - 0.5) * 1.2).normalize();
      if (t.style === "cascade") dir.y = -0.35;
      const reach = (0.2 + 0.42 * (1 - u)) * H * (t.style === "cascade" ? 0.6 : 1);
      const size = t.padSize * (0.65 + 0.55 * (1 - u)) * (cascade ? 0.5 : 1);
      branch(at, dir.normalize(), reach, trunk.girth * (0.5 - u * 0.25), size);
    }
    for (let i = 0; i < t.deadwood; i++) {
      const u = 0.5 + r() * 0.4;
      branch(curve.getPointAt(u), v(t.style === "windswept" ? -s : r() - 0.5, 0.6, r() - 0.5).normalize(), H * 0.25, trunk.girth * 0.3, 0, true);
    }
  }

  const { geometry: potGeometry, groundY } = pot(t.pot, r);
  // surface roots (nebari): out from the base, down onto the soil or the mound
  const reach = t.pot === "none" || t.pot === "slab" ? 0.42 : 0.18;
  for (let i = 0; i < t.roots; i++) {
    const a = (i / t.roots) * Math.PI * 2 + r() * 0.5, d = reach * (0.5 + r() * 0.5);
    const end = v(Math.cos(a) * d * 1.3, (t.pot === "none" ? -0.04 : -0.01) - r() * 0.02, Math.sin(a) * d * 0.8);
    const mid = v(Math.cos(a + 0.2) * d * 0.45, 0.02, Math.sin(a + 0.2) * d * 0.35);
    bark.push(tube([v(0, 0.06, 0), mid, end], t.girth * 0.55, t.girth * 0.05, 0, 6));
  }

  return { bark: mergeGeometries(bark)!, dead: dead.length ? mergeGeometries(dead) : null, pot: potGeometry, tufts, groundY };
}
