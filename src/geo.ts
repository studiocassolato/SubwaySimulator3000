import type { Seed } from './maps';
import type { Vec, ZoneType } from './types';

/** Un punto reale: [latitudine, longitudine] (dati OpenStreetMap). */
export type LatLon = [number, number];

/**
 * Proiezione "a lente" dalle coordinate reali a quelle di gioco.
 * Le direzioni sono quelle vere; le distanze sono compresse in modo logaritmico
 * attorno al centro, così il centro storico è grande e giocabile e le frazioni
 * e i paesi vicini restano nella stessa mappa, nella posizione giusta l'uno rispetto all'altro.
 *
 *   distanza di gioco = A · ln(1 + d / r0)      (d in metri)
 *
 * Vicino al centro 1 metro vale circa A / r0 unità.
 */
export function projector(center: LatLon, origin: Vec, A: number, r0: number) {
  const [lat0, lon0] = center;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const fwd = ([lat, lon]: LatLon): Vec => {
    const dx = (lon - lon0) * kx;
    const dy = -(lat - lat0) * ky;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return { x: origin.x, y: origin.y };
    const s = (A * Math.log(1 + d / r0)) / d;
    return { x: Math.round(origin.x + dx * s), y: Math.round(origin.y + dy * s) };
  };
  return {
    pt: fwd,
    pts: (list: LatLon[]): Vec[] => list.map(fwd),
  };
}

export const P = (pts: [number, number][]): Vec[] => pts.map(([x, y]) => ({ x, y }));
export const rect = (x0: number, y0: number, x1: number, y1: number) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/** Poligono regolare (o ellisse) attorno a un centro. */
export function ring(c: Vec, rx: number, ry = rx, n = 24, rot = 0): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push({ x: Math.round(c.x + Math.cos(a) * rx), y: Math.round(c.y + Math.sin(a) * ry) });
  }
  return out;
}

/** Ingrandisce/rimpicciolisce un poligono attorno al suo baricentro. */
export function scalePoly(poly: Vec[], k: number): Vec[] {
  const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return poly.map((p) => ({ x: Math.round(c.x + (p.x - c.x) * k), y: Math.round(c.y + (p.y - c.y) * k) }));
}

/** Ammorbidisce una spezzata (Chaikin), utile per fiumi e ferrovie. */
export function smooth(pts: Vec[], iterations = 2): Vec[] {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Vec[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/** Trasforma il corso di un fiume (una linea) in un poligono largo 2·half. */
export function riverPoly(line: Vec[], half: number): Vec[] {
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const p = line[i];
    left.push({ x: Math.round(p.x + nx * half), y: Math.round(p.y + ny * half) });
    right.push({ x: Math.round(p.x - nx * half), y: Math.round(p.y - ny * half) });
  }
  return [...left, ...right.reverse()];
}

/** Angolo (per le scritte) di un fiume vicino al punto i-esimo, sempre leggibile da sinistra a destra. */
export function labelAngle(line: Vec[], i: number): number {
  const a = line[Math.max(0, i - 1)];
  const b = line[Math.min(line.length - 1, i + 1)];
  let ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (ang > Math.PI / 2) ang -= Math.PI;
  if (ang < -Math.PI / 2) ang += Math.PI;
  return ang;
}

/** Il punto della linea più vicino a una certa y (per mettere le etichette lungo i fiumi). */
export function nearestIndex(line: Vec[], p: Vec): number {
  let best = 0;
  let bd = Infinity;
  line.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Spezzata che separa due lati (es. il fiume), estesa fino ai bordi per chiudere un poligono. */
export function sideOf(line: Vec[], side: 'west' | 'east', W: number, H: number): Vec[] {
  const pad = 200;
  const first = line[0];
  const last = line[line.length - 1];
  const edgeX = side === 'west' ? -pad : W + pad;
  return [{ x: edgeX, y: Math.min(first.y, -pad) }, { x: first.x, y: Math.min(first.y, -pad) }, ...line, { x: last.x, y: Math.max(last.y, H + pad) }, { x: edgeX, y: Math.max(last.y, H + pad) }];
}

export const seed = (name: string, type: ZoneType, at: Vec, r: number): Seed => ({ name, type, x: at.x, y: at.y, r });

/**
 * Spicchio di mappa tra due direzioni (gradi, 0 = est, 90 = sud, in senso orario),
 * usato per dividere la periferia in distretti.
 */
export function wedge(o: Vec, fromDeg: number, toDeg: number, R = 20000): Vec[] {
  const out: Vec[] = [{ x: o.x, y: o.y }];
  const span = ((toDeg - fromDeg) % 360 + 360) % 360 || 360;
  for (let i = 0; i <= 12; i++) {
    const a = ((fromDeg + (span * i) / 12) * Math.PI) / 180;
    out.push({ x: Math.round(o.x + Math.cos(a) * R), y: Math.round(o.y + Math.sin(a) * R) });
  }
  return out;
}

/** Allontana un punto dal centro c finché non è ad almeno minR (per le porte sul fossato). */
export function pushOut(c: Vec, p: Vec, minR: number): Vec {
  const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
  if (d >= minR) return p;
  return { x: Math.round(c.x + ((p.x - c.x) / d) * minR), y: Math.round(c.y + ((p.y - c.y) / d) * minR) };
}

/** Punto a distanza r dal centro in una direzione (gradi come in wedge), per le scritte dei distretti. */
export function dirPoint(o: Vec, deg: number, r: number): Vec {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round(o.x + Math.cos(a) * r), y: Math.round(o.y + Math.sin(a) * r) };
}
