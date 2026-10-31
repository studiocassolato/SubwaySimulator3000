import type { Vec } from './types';

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Percorso a 45°/90° tra due punti: tratto dritto + tratto diagonale. */
export function octilinear(a: Vec, b: Vec): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < 1 || ady < 1 || Math.abs(adx - ady) < 1) return [a, b];
  const d = Math.min(adx, ady);
  // la parte diagonale sta al centro, i tratti dritti agli estremi
  const straight = (Math.max(adx, ady) - d) / 2;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (adx > ady) {
    return [a, { x: a.x + sx * straight, y: a.y }, { x: b.x - sx * straight, y: b.y }, b];
  }
  return [a, { x: a.x, y: a.y + sy * straight }, { x: b.x, y: b.y - sy * straight }, b];
}

export function polylineLength(pts: Vec[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Punto e direzione a distanza s lungo la polilinea. */
export function pointAt(pts: Vec[], s: number): { p: Vec; angle: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= s || i === pts.length - 1) {
      const t = seg === 0 ? 0 : Math.max(0, Math.min(1, (s - acc) / seg));
      const a = pts[i - 1];
      const b = pts[i];
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    acc += seg;
  }
  return { p: pts[0], angle: 0 };
}

export function segIntersect(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** Punti in cui la polilinea p attraversa la polilinea q. */
export function crossings(p: Vec[], q: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 1; i < p.length; i++) {
    for (let j = 1; j < q.length; j++) {
      const hit = segIntersect(p[i - 1], p[i], q[j - 1], q[j]);
      if (hit) out.push(hit);
    }
  }
  return out;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

export function distToPolyline(p: Vec, pts: Vec[]): number {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, distToSegment(p, pts[i - 1], pts[i]));
  return m;
}

/** Generatore pseudo-casuale deterministico (mulberry32). */
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
