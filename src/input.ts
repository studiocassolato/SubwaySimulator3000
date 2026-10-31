import type { Camera } from './camera';
import { LINE_COLORS } from './config';
import { distToPolyline } from './geometry';
import { WORLD_H, WORLD_W } from './nyc';
import { lineHandles, type DragPreview, type Selection } from './render';
import type { Game } from './sim';
import type { Vec } from './types';

export type Tool = 'line' | 'station' | 'demolish';

const SNAP_PX = 26; // raggio di aggancio generoso per il touch
const TAP_PX = 8;

type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; moved: number }
  | { kind: 'pinch'; dist: number; mid: Vec }
  | { kind: 'draw'; preview: DragPreview; lineId?: number; atEnd?: boolean; insertIdx?: number };

export class Input {
  tool: Tool = 'line';
  selection: Selection = null;
  drag: DragPreview | null = null;
  hoverStation: number | null = null;
  placing: Vec | null = null;
  onSelect: (s: Selection) => void = () => {};
  onQuote: (text: string | null) => void = () => {};

  private pointers = new Map<number, Vec>();
  private mode: Mode = { kind: 'none' };
  private downAt: Vec = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private cam: Camera, private game: Game) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.cancel(e));
    canvas.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.placing = null;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.zoomAt(this.local(e), Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  setTool(t: Tool) {
    this.tool = t;
    this.placing = null;
  }

  private local(e: { clientX: number; clientY: number }): Vec {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  stationAt(screen: Vec): number | null {
    let best: number | null = null;
    let bd = SNAP_PX;
    for (const st of this.game.state.stations) {
      const p = this.cam.toScreen(st);
      const d = Math.hypot(p.x - screen.x, p.y - screen.y);
      if (d < bd) {
        bd = d;
        best = st.id;
      }
    }
    return best;
  }

  private lineAt(world: Vec, tolPx = 12): { lineId: number; seg: number } | null {
    const tol = tolPx / this.cam.zoom;
    let best: { lineId: number; seg: number } | null = null;
    let bd = tol;
    for (const line of this.game.state.lines) {
      for (let i = 1; i < line.stations.length; i++) {
        const a = this.game.net.stationById.get(line.stations[i - 1])!;
        const b = this.game.net.stationById.get(line.stations[i])!;
        const g = this.game.net.geom.get(line.id)!;
        // usa il tratto di geometria tra le due fermate
        const s0 = g.stationDist[i - 1];
        const s1 = g.stationDist[i];
        const pts = slice(g.pts, s0, s1, a, b);
        const d = distToPolyline(world, pts);
        if (d < bd) {
          bd = d;
          best = { lineId: line.id, seg: i - 1 };
        }
      }
    }
    return best;
  }

  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // secondo dito: si passa al pinch e si annulla il disegno
      this.drag = null;
      this.onQuote(null);
      const [a, b] = [...this.pointers.values()];
      this.mode = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: mid(a, b) };
      return;
    }
    if (this.pointers.size > 2) return;
    this.downAt = p;
    const w = this.cam.toWorld(p);

    if (this.tool === 'line') {
      const handle = lineHandles(this.game, this.cam).find((h) => {
        const s = this.cam.toScreen(h.p);
        return Math.hypot(s.x - p.x, s.y - p.y) < SNAP_PX;
      });
      if (handle) {
        const line = this.game.state.lines.find((l) => l.id === handle.lineId)!;
        const anchor = handle.atEnd ? line.stations[line.stations.length - 1] : line.stations[0];
        this.mode = {
          kind: 'draw', lineId: line.id, atEnd: handle.atEnd,
          preview: { chain: [], anchor, pointer: w, color: line.color },
        };
        this.selection = { kind: 'line', id: line.id };
        this.onSelect(this.selection);
        return;
      }
      const st = this.stationAt(p);
      if (st !== null) {
        const used = new Set(this.game.state.lines.map((l) => l.color));
        const color = LINE_COLORS.find((c) => !used.has(c)) ?? '#888';
        this.mode = { kind: 'draw', preview: { chain: [st], pointer: w, color } };
        return;
      }
      if (this.selection?.kind === 'line') {
        const hit = this.lineAt(w);
        if (hit && hit.lineId === this.selection.id) {
          const line = this.game.state.lines.find((l) => l.id === hit.lineId)!;
          this.mode = {
            kind: 'draw', lineId: line.id, insertIdx: hit.seg,
            preview: {
              chain: [], pointer: w, color: line.color,
              insertBetween: [line.stations[hit.seg], line.stations[hit.seg + 1]],
            },
          };
          return;
        }
      }
    }
    this.mode = { kind: 'pan', moved: 0 };
  }

  private move(e: PointerEvent) {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (this.tool === 'station' && e.pointerType === 'mouse') this.placing = this.cam.toWorld(p);
    if (!prev) {
      if (e.pointerType === 'mouse') this.hoverStation = this.stationAt(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const m = this.mode;
    if (m.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = mid(a, b);
      this.cam.panBy(c.x - m.mid.x, c.y - m.mid.y);
      this.cam.zoomAt(c, d / m.dist);
      m.dist = d;
      m.mid = c;
    } else if (m.kind === 'pan') {
      this.cam.panBy(p.x - prev.x, p.y - prev.y);
      this.cam.clamp(WORLD_W, WORLD_H);
      m.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
    } else if (m.kind === 'draw') {
      this.updateDraw(m, p);
    }
  }

  private updateDraw(m: Extract<Mode, { kind: 'draw' }>, p: Vec) {
    const pv = m.preview;
    pv.pointer = this.cam.toWorld(p);
    this.drag = pv;
    const st = this.stationAt(p);
    this.hoverStation = st;
    const line = m.lineId !== undefined ? this.game.state.lines.find((l) => l.id === m.lineId) : undefined;
    if (st !== null) {
      if (m.insertIdx !== undefined) {
        pv.chain = line && !line.stations.includes(st) ? [st] : [];
      } else if (pv.chain.length >= 2 && pv.chain[pv.chain.length - 2] === st) {
        pv.chain.pop(); // tornando indietro si annulla l'ultima fermata
      } else if (pv.chain.length === 1 && pv.anchor !== undefined && st === pv.anchor) {
        pv.chain.pop();
      } else if (!pv.chain.includes(st) && st !== pv.anchor && !(line && line.stations.includes(st))) {
        pv.chain.push(st);
      }
    } else if (m.insertIdx !== undefined) {
      pv.chain = [];
    }
    this.updateQuote(m);
  }

  private updateQuote(m: Extract<Mode, { kind: 'draw' }>) {
    const pv = m.preview;
    if (m.insertIdx !== undefined) {
      if (!pv.chain.length || !pv.insertBetween) return this.onQuote('Trascina su una stazione per aggiungerla alla linea');
      const [a, b] = pv.insertBetween;
      const q = this.game.net.trackCost([a, pv.chain[0], b]).cost - this.game.net.trackCost([a, b]).cost;
      return this.onQuote(`Deviazione: $${Math.max(0, q)}`);
    }
    if (pv.anchor !== undefined) {
      if (!pv.chain.length) return this.onQuote('Trascina verso una stazione per prolungare');
      const q = this.game.quote([pv.anchor, ...pv.chain], false);
      return this.onQuote(`Prolungamento: $${q.cost}${q.tunnels ? ` (${q.tunnels} gallerie)` : ''}`);
    }
    if (pv.chain.length < 2) return this.onQuote('Trascina verso un\'altra stazione');
    const q = this.game.quote(pv.chain, true);
    this.onQuote(`Nuova linea: $${q.cost} con 1 treno${q.tunnels ? `, ${q.tunnels} gallerie` : ''}`);
  }

  private up(e: PointerEvent) {
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    const m = this.mode;
    if (this.pointers.size > 0) {
      if (m.kind === 'pinch') this.mode = { kind: 'pan', moved: 99 };
      return;
    }
    this.mode = { kind: 'none' };
    this.drag = null;
    this.onQuote(null);
    if (m.kind === 'draw') {
      const pv = m.preview;
      if (m.insertIdx !== undefined && m.lineId !== undefined) {
        if (pv.chain.length) this.game.insertStation(m.lineId, m.insertIdx, pv.chain[0]);
      } else if (m.lineId !== undefined) {
        if (pv.chain.length) this.game.extendLine(m.lineId, pv.chain, !!m.atEnd);
      } else if (pv.chain.length >= 2) {
        const line = this.game.createLine(pv.chain);
        if (line) this.select({ kind: 'line', id: line.id });
      } else if (Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < TAP_PX) {
        this.tap(p);
      }
      return;
    }
    if (m.kind === 'pan' && m.moved < TAP_PX) this.tap(p);
  }

  private cancel(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.mode = { kind: 'none' };
    this.drag = null;
    this.onQuote(null);
  }

  private tap(p: Vec) {
    const w = this.cam.toWorld(p);
    const st = this.stationAt(p);
    if (this.tool === 'station') {
      if (st !== null) return this.select({ kind: 'station', id: st });
      const created = this.game.addStation(w.x, w.y);
      if (created) this.select({ kind: 'station', id: created.id });
      return;
    }
    if (this.tool === 'demolish') {
      if (st !== null) {
        this.game.removeStation(st);
        this.select(null);
      }
      return;
    }
    if (st !== null) return this.select({ kind: 'station', id: st });
    const hit = this.lineAt(w, 14);
    if (hit) return this.select({ kind: 'line', id: hit.lineId });
    const cell = this.game.state.cells.find((c) => w.x >= c.x && w.x <= c.x + c.w && w.y >= c.y && w.y <= c.y + c.h);
    this.select(cell ? { kind: 'cell', id: cell.id } : null);
  }

  select(s: Selection) {
    this.selection = s;
    this.onSelect(s);
  }
}

function mid(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Porzione di polilinea tra le distanze s0 e s1 (approssimata ai vertici). */
function slice(pts: Vec[], s0: number, s1: number, a: Vec, b: Vec): Vec[] {
  const out: Vec[] = [a];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc > s0 + 0.5 && acc < s1 - 0.5) out.push(pts[i]);
  }
  out.push(b);
  return out;
}
