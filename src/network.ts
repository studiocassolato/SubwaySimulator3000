import { COST, STATION_RADIUS, ZONE_TYPES } from './config';
import { dist, octilinear, polylineLength } from './geometry';
import { waterCrossings } from './maps';
import type { GameState, Line, Station, Vec, ZoneType } from './types';

export interface LineGeom {
  pts: Vec[];
  /** distanza lungo pts di ogni fermata della linea */
  stationDist: number[];
  /** punti di attraversamento del fiume (gallerie) */
  tunnels: Vec[];
}

/**
 * Dati derivati dallo stato (geometrie, bacini, instradamento).
 * Non viene salvato: si ricostruisce quando la rete cambia.
 */
export class Network {
  geom = new Map<number, LineGeom>();
  /** isolati assegnati a ciascuna stazione (ogni isolato va alla stazione più vicina) */
  catchment = new Map<number, number[]>();
  /** tipi di zona serviti da ciascuna stazione */
  serves = new Map<number, Set<ZoneType>>();
  /** per tipo di zona: numero di fermate per raggiungerla da ogni stazione */
  route = new Map<ZoneType, Map<number, number>>();
  stationById = new Map<number, Station>();
  linesAt = new Map<number, Line[]>();

  constructor(private state: GameState) {
    this.rebuild();
  }

  setState(state: GameState) {
    this.state = state;
    this.rebuild();
  }

  rebuild() {
    const s = this.state;
    this.stationById = new Map(s.stations.map((st) => [st.id, st]));
    this.buildGeometry();
    this.buildCatchment();
    this.buildRoutes();
  }

  private buildGeometry() {
    const s = this.state;
    // linee che condividono la stessa tratta vengono affiancate
    const shared = new Map<string, number[]>();
    for (const line of s.lines) {
      for (let i = 1; i < line.stations.length; i++) {
        const k = pairKey(line.stations[i - 1], line.stations[i]);
        const arr = shared.get(k) ?? [];
        arr.push(line.id);
        shared.set(k, arr);
      }
    }
    this.geom.clear();
    this.linesAt.clear();
    for (const line of s.lines) {
      const pts: Vec[] = [];
      const stationDist: number[] = [];
      for (let i = 0; i < line.stations.length; i++) {
        const st = this.stationById.get(line.stations[i]);
        if (!st) continue;
        if (!line.seized) {
          const arr = this.linesAt.get(st.id) ?? [];
          arr.push(line);
          this.linesAt.set(st.id, arr);
        }
        if (i === 0) {
          pts.push({ x: st.x, y: st.y });
          stationDist.push(0);
          continue;
        }
        const prev = this.stationById.get(line.stations[i - 1])!;
        const k = pairKey(prev.id, st.id);
        const group = shared.get(k)!;
        const idx = group.indexOf(line.id);
        const off = (idx - (group.length - 1) / 2) * 9;
        // normale calcolata sulla coppia ordinata, così l'offset è coerente nei due sensi
        const [lo, hi] = prev.id < st.id ? [prev, st] : [st, prev];
        const len = dist(lo, hi) || 1;
        const nx = -(hi.y - lo.y) / len;
        const ny = (hi.x - lo.x) / len;
        const seg = octilinear(prev, st).map((p, j, all) =>
          j === 0 || j === all.length - 1 ? { ...p } : { x: p.x + nx * off, y: p.y + ny * off },
        );
        for (let j = 1; j < seg.length; j++) pts.push(seg[j]);
        stationDist.push(polylineLength(pts));
      }
      const tunnels: Vec[] = [];
      for (let j = 1; j < pts.length; j++) tunnels.push(...waterCrossings(pts[j - 1], pts[j]));
      this.geom.set(line.id, { pts, stationDist, tunnels });
    }
  }

  private buildCatchment() {
    const s = this.state;
    this.catchment.clear();
    this.serves.clear();
    for (const st of s.stations) {
      this.catchment.set(st.id, []);
      this.serves.set(st.id, new Set());
    }
    for (const c of s.cells) {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      let best: Station | null = null;
      let bd = STATION_RADIUS;
      for (const st of s.stations) {
        const d = Math.hypot(st.x - cx, st.y - cy);
        if (d < bd) {
          bd = d;
          best = st;
        }
      }
      if (best) {
        this.catchment.get(best.id)!.push(c.id);
        if (c.density > 0) this.serves.get(best.id)!.add(c.type);
      }
    }
  }

  private buildRoutes() {
    const s = this.state;
    const adj = new Map<number, Set<number>>();
    for (const st of s.stations) adj.set(st.id, new Set());
    for (const line of s.lines) {
      if (line.seized) continue;
      for (let i = 1; i < line.stations.length; i++) {
        adj.get(line.stations[i - 1])?.add(line.stations[i]);
        adj.get(line.stations[i])?.add(line.stations[i - 1]);
      }
    }
    const closed = new Set(s.events.filter((e) => e.kind === 'works').map((e) => e.stationId));
    this.route.clear();
    for (const t of ZONE_TYPES) {
      const d = new Map<number, number>();
      const queue: number[] = [];
      for (const st of s.stations) {
        if (this.serves.get(st.id)!.has(t) && !closed.has(st.id) && adj.get(st.id)!.size > 0) {
          d.set(st.id, 0);
          queue.push(st.id);
        }
      }
      while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adj.get(cur)!) {
          if (!d.has(n)) {
            d.set(n, d.get(cur)! + 1);
            queue.push(n);
          }
        }
      }
      this.route.set(t, d);
    }
  }

  hopsTo(type: ZoneType, stationId: number): number {
    return this.route.get(type)?.get(stationId) ?? Infinity;
  }

  lineHasTunnel(lineId: number): boolean {
    return (this.geom.get(lineId)?.tunnels.length ?? 0) > 0;
  }

  /** Costo di binari e gallerie per collegare in sequenza le stazioni date. */
  trackCost(stationIds: number[]): { cost: number; tunnels: number } {
    let cost = 0;
    let tunnels = 0;
    for (let i = 1; i < stationIds.length; i++) {
      const a = this.stationById.get(stationIds[i - 1]);
      const b = this.stationById.get(stationIds[i]);
      if (!a || !b) continue;
      const seg = octilinear(a, b);
      let n = 0;
      for (let j = 1; j < seg.length; j++) n += waterCrossings(seg[j - 1], seg[j]).length;
      tunnels += n;
      cost += polylineLength(seg) * COST.trackPerUnit + n * COST.tunnel;
    }
    return { cost: Math.round(cost), tunnels };
  }
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
