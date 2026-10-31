import type { Camera } from './camera';
import { STATION_RADIUS, ZONES } from './config';
import { octilinear, pointAt } from './geometry';
import { BROOKLYN_LABEL, CENTRAL_PARK, LAND, SEEDS, WATER_LABELS, WORLD_H, WORLD_W } from './nyc';
import type { Game } from './sim';
import type { Vec } from './types';

export const FONT = '"Space Grotesk", "Segoe UI", system-ui, sans-serif';

export const COLORS = {
  water: '#a9cfe4',
  waterDeep: '#93c0da',
  land: '#f2eee4',
  shore: '#d9d2c1',
  ink: '#1f2a37',
  muted: '#7b8794',
};

export type Selection =
  | { kind: 'station'; id: number }
  | { kind: 'line'; id: number }
  | { kind: 'cell'; id: number }
  | null;

export interface DragPreview {
  chain: number[];
  pointer: Vec;
  color: string;
  /** stazione di partenza esistente della linea (per prolungamenti/inserimenti) */
  anchor?: number;
  insertBetween?: [number, number];
}

export interface RenderOpts {
  selection: Selection;
  drag: DragPreview | null;
  hoverStation: number | null;
  placing: Vec | null;
  tool: string;
}

export function lineHandles(game: Game, cam: Camera) {
  // piccola "T" oltre ogni capolinea, da trascinare per prolungare la linea
  const out: { lineId: number; atEnd: boolean; p: Vec; from: Vec }[] = [];
  const byStation = new Map<string, number>();
  for (const line of game.state.lines) {
    const n = line.stations.length;
    for (const atEnd of [false, true]) {
      const a = game.net.stationById.get(line.stations[atEnd ? n - 1 : 0]);
      const b = game.net.stationById.get(line.stations[atEnd ? n - 2 : 1]);
      if (!a || !b) continue;
      const k = `${a.id}`;
      const stack = byStation.get(k) ?? 0;
      byStation.set(k, stack + 1);
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      const px = 34 / cam.zoom;
      const side = (stack % 2 ? 1 : -1) * Math.ceil(stack / 2) * (12 / cam.zoom);
      out.push({
        lineId: line.id,
        atEnd,
        from: { x: a.x, y: a.y },
        p: { x: a.x + dx * px - dy * side, y: a.y + dy * px + dx * side },
      });
    }
  }
  return out;
}

export function render(ctx: CanvasRenderingContext2D, game: Game, cam: Camera, opts: RenderOpts) {
  const { state, net } = game;
  const z = cam.zoom;
  const px = (n: number) => n / z;
  ctx.save();
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.translate(cam.w / 2, cam.h / 2);
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);

  const view = {
    x0: cam.x - cam.w / 2 / z - 100, y0: cam.y - cam.h / 2 / z - 100,
    x1: cam.x + cam.w / 2 / z + 100, y1: cam.y + cam.h / 2 / z + 100,
  };

  // terraferma
  for (const land of LAND) {
    path(ctx, land.poly, true);
    ctx.fillStyle = COLORS.land;
    ctx.fill();
    ctx.strokeStyle = COLORS.shore;
    ctx.lineWidth = px(3);
    ctx.stroke();
  }
  path(ctx, CENTRAL_PARK, true);
  ctx.fillStyle = '#cfe6c6';
  ctx.fill();

  // isolati
  const night = isNight(state.time);
  for (const c of state.cells) {
    if (c.x > view.x1 || c.y > view.y1 || c.x + c.w < view.x0 || c.y + c.h < view.y0) continue;
    const info = ZONES[c.type];
    if (c.density === 0) {
      ctx.strokeStyle = 'rgba(120,120,120,0.25)';
      ctx.lineWidth = px(1);
      ctx.strokeRect(c.x + 6, c.y + 6, c.w - 12, c.h - 12);
      continue;
    }
    ctx.globalAlpha = 0.28 + c.density * 0.13;
    ctx.fillStyle = info.color;
    roundRect(ctx, c.x, c.y, c.w, c.h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (z > 0.5) {
      // tacche di densità
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < c.density; i++) ctx.fillRect(c.x + 6 + i * 9, c.y + c.h - 11, 6, 5);
    }
  }
  if (z > 0.38) {
    ctx.font = `${30}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of state.cells) {
      if (!c.density || c.x > view.x1 || c.y > view.y1 || c.x + c.w < view.x0 || c.y + c.h < view.y0) continue;
      // un'icona ogni tanto basta a riconoscere la zona senza affollare
      if (z < 0.8 && (c.id % 3 !== 0) && c.type !== 'hospital') continue;
      ctx.fillText(ZONES[c.type].icon, c.x + c.w / 2, c.y + c.h / 2 - 3);
    }
  }
  if (night) {
    ctx.fillStyle = 'rgba(20,30,70,0.18)';
    ctx.fillRect(-500, -500, WORLD_W + 1000, WORLD_H + 1000);
  }

  // etichette geografiche
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const w of WATER_LABELS) {
    ctx.save();
    ctx.translate(w.at.x, w.at.y);
    ctx.rotate(w.angle);
    ctx.font = `italic 500 ${px(13)}px ${FONT}`;
    ctx.fillStyle = 'rgba(40,90,130,0.75)';
    ctx.fillText(w.name, 0, 0);
    ctx.restore();
  }
  const boroughs = [...LAND.map((l) => ({ name: l.name, at: l.label })), { name: 'BROOKLYN', at: BROOKLYN_LABEL }];
  ctx.font = `700 ${Math.max(px(16), 70)}px ${FONT}`;
  for (const b of boroughs) {
    ctx.fillStyle = 'rgba(31,42,55,0.16)';
    spaced(ctx, b.name, b.at.x, b.at.y, Math.max(px(16), 70) * 0.25);
  }
  if (z > 0.42) {
    ctx.font = `600 ${px(11)}px ${FONT}`;
    ctx.fillStyle = 'rgba(31,42,55,0.45)';
    for (const s of SEEDS) ctx.fillText(s.name.toUpperCase(), s.x, s.y - 46);
  }

  // bacino d'utenza della stazione selezionata o in costruzione
  const ring = (p: Vec) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, STATION_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(31,42,55,0.06)';
    ctx.fill();
    ctx.setLineDash([px(6), px(6)]);
    ctx.strokeStyle = 'rgba(31,42,55,0.5)';
    ctx.lineWidth = px(1.5);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (opts.selection?.kind === 'station') {
    const st = net.stationById.get(opts.selection.id);
    if (st) ring(st);
  }
  if (opts.placing) ring(opts.placing);

  // linee
  const selLine = opts.selection?.kind === 'line' ? opts.selection.id : null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of state.lines) {
    const g = net.geom.get(line.id);
    if (!g) continue;
    const dim = selLine !== null && selLine !== line.id;
    path(ctx, g.pts, false);
    if (selLine === line.id) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = px(13);
      ctx.stroke();
    }
    ctx.strokeStyle = line.color;
    ctx.globalAlpha = dim ? 0.35 : 1;
    ctx.lineWidth = px(7);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // gallerie: tratteggio bianco sopra la linea
    for (const t of g.tunnels) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, px(9), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = px(3);
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 ${px(9)}px ${FONT}`;
      ctx.fillText('T', t.x, t.y + px(0.5));
    }
  }
  for (const h of lineHandles(game, cam)) {
    const line = state.lines.find((l) => l.id === h.lineId)!;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = px(7);
    ctx.beginPath();
    ctx.moveTo(h.from.x, h.from.y);
    ctx.lineTo(h.p.x, h.p.y);
    ctx.stroke();
    const dx = h.p.x - h.from.x;
    const dy = h.p.y - h.from.y;
    const l = Math.hypot(dx, dy) || 1;
    ctx.lineWidth = px(6);
    ctx.beginPath();
    ctx.moveTo(h.p.x - (dy / l) * px(10), h.p.y + (dx / l) * px(10));
    ctx.lineTo(h.p.x + (dy / l) * px(10), h.p.y - (dx / l) * px(10));
    ctx.stroke();
  }

  // anteprima del trascinamento
  if (opts.drag) {
    const d = opts.drag;
    const pts: Vec[] = [];
    const ids = d.insertBetween ? [d.insertBetween[0], ...d.chain] : d.anchor !== undefined ? [d.anchor, ...d.chain] : d.chain;
    for (let i = 0; i < ids.length; i++) {
      const st = net.stationById.get(ids[i])!;
      if (i === 0) pts.push(st);
      else pts.push(...octilinear(net.stationById.get(ids[i - 1])!, st).slice(1));
    }
    const last = net.stationById.get(ids[ids.length - 1])!;
    pts.push(...octilinear(last, d.pointer).slice(1));
    if (d.insertBetween) pts.push(...octilinear(d.pointer, net.stationById.get(d.insertBetween[1])!).slice(1));
    path(ctx, pts, false);
    ctx.strokeStyle = d.color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = px(7);
    ctx.setLineDash([px(10), px(8)]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // treni
  for (const t of state.trains) {
    const line = state.lines.find((l) => l.id === t.lineId);
    const g = line && net.geom.get(line.id);
    if (!line || !g) continue;
    const { p, angle } = pointAt(g.pts, t.pos);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const w = px(26);
    const h = px(13);
    roundRect(ctx, -w / 2, -h / 2, w, h, px(3));
    ctx.fillStyle = t.brokenFor > 0 ? '#555' : line.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = px(1.5);
    ctx.stroke();
    t.passengers.slice(0, 12).forEach((pa, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      ctx.fillStyle = ZONES[pa.dest].color;
      ctx.beginPath();
      ctx.arc(-w / 2 + px(3) + col * px(4), -h / 2 + px(3.5) + row * px(5.5), px(1.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = px(0.6);
      ctx.stroke();
    });
    ctx.restore();
    if (t.brokenFor > 0) {
      ctx.font = `${px(16)}px ${FONT}`;
      ctx.fillText('🔧', p.x, p.y - px(16));
    }
  }

  // stazioni
  const closed = new Set(state.events.filter((e) => e.kind === 'works').map((e) => e.stationId));
  for (const st of state.stations) {
    if (st.x < view.x0 || st.x > view.x1 || st.y < view.y0 || st.y > view.y1) continue;
    const r = px(opts.hoverStation === st.id ? 12 : 9);
    const linked = (net.linesAt.get(st.id)?.length ?? 0) > 0;
    const sel = opts.selection?.kind === 'station' && opts.selection.id === st.id;
    if (st.waiting.length > 20) {
      ctx.beginPath();
      ctx.arc(st.x, st.y, r + px(6) + Math.sin(performance.now() / 150) * px(2), 0, Math.PI * 2);
      ctx.strokeStyle = '#e53935';
      ctx.lineWidth = px(3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(st.x, st.y, r, 0, Math.PI * 2);
    ctx.fillStyle = closed.has(st.id) ? '#ffb74d' : '#fff';
    ctx.fill();
    ctx.strokeStyle = sel ? '#1e88e5' : COLORS.ink;
    ctx.lineWidth = px(linked ? 3.5 : 2);
    if (!linked) ctx.setLineDash([px(3), px(3)]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (closed.has(st.id)) {
      ctx.font = `${px(13)}px ${FONT}`;
      ctx.fillText('🚧', st.x, st.y - px(20));
    }
    // passeggeri in attesa, colorati per destinazione
    st.waiting.slice(0, 18).forEach((p, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      ctx.beginPath();
      ctx.arc(st.x + r + px(6) + col * px(6), st.y - px(5) + row * px(6), px(2.4), 0, Math.PI * 2);
      ctx.fillStyle = ZONES[p.dest].color;
      ctx.fill();
    });
    if (st.waiting.length > 18) {
      ctx.font = `700 ${px(9)}px ${FONT}`;
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'left';
      ctx.fillText(`+${st.waiting.length - 18}`, st.x + r + px(42), st.y + px(1));
      ctx.textAlign = 'center';
    }
    if (z > 0.22 || sel) {
      ctx.font = `600 ${px(11)}px ${FONT}`;
      ctx.lineWidth = px(3);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(st.name, st.x, st.y + r + px(11));
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(st.name, st.x, st.y + r + px(11));
    }
  }

  if (opts.placing) {
    ctx.beginPath();
    ctx.arc(opts.placing.x, opts.placing.y, px(9), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = px(2);
    ctx.stroke();
  }
  ctx.restore();
}

export function isNight(time: number) {
  const h = (time / 60) % 24;
  return h >= 21 || h < 6;
}

function path(ctx: CanvasRenderingContext2D, pts: Vec[], close: boolean) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let cx = x - total / 2;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i];
  });
  ctx.textAlign = 'center';
}
