import { CELL, INITIAL_STATIONS } from './config';
import { rng } from './geometry';
import { MAP, landAt, pointInPoly, setMap, type Seed } from './maps';
import type { Cell, GameState, MapId, Station, Vec, ZoneType } from './types';

export const SAVE_VERSION = 2;

const coreDist = (p: Vec) => Math.min(...MAP.cores.map((k) => Math.hypot(k.x - p.x, k.y - p.y)));

/**
 * Ordine in cui il sindaco approva le stazioni: prima i quartieri centrali,
 * poi via via quelli più lontani. Deterministico, così non va salvato.
 */
const orders = new Map<string, Seed[]>();
export function siteOrder(): Seed[] {
  let out = orders.get(MAP.id);
  if (out) return out;
  out = [];
  for (const s of [...MAP.seeds].sort((a, b) => coreDist(a) - coreDist(b))) {
    if (!landAt(s)) continue;
    if (out.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 160)) continue;
    out.push(s);
  }
  orders.set(MAP.id, out);
  return out;
}

export function makeStation(id: number, site: Seed): Station {
  return { id, x: site.x, y: site.y, name: site.name, waiting: [], served: 0, crowd: 0, discontent: 0 };
}

/** Distanza minima di un punto dal bordo dell'acqua (approssimata a campioni). */
function nearWater(c: Vec, r: number): boolean {
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    if (!landAt({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r })) return true;
  }
  return false;
}

export function newGame(mapId: MapId = 'nyc', seed = Math.floor(Math.random() * 1e9)): GameState {
  setMap(mapId);
  const rand = rng(seed);
  const cells: Cell[] = [];
  let id = 1;
  const gap = 10;
  for (let gy = 0; gy * CELL < MAP.height; gy++) {
    for (let gx = 0; gx * CELL < MAP.width; gx++) {
      const x = gx * CELL + gap / 2;
      const y = gy * CELL + gap / 2;
      const c = { x: x + CELL / 2 - gap / 2, y: y + CELL / 2 - gap / 2 };
      const land = landAt(c);
      if (!land || nearWater(c, CELL * 0.42)) continue;
      if (rand() < 0.05) continue;

      let type: ZoneType = 'residential';
      if (MAP.parks.some((pk) => pointInPoly(c, pk))) {
        type = 'leisure';
      } else {
        let best = Infinity;
        for (const s of MAP.seeds) {
          const score = (Math.hypot(s.x - c.x, s.y - c.y) / s.r) * (0.9 + rand() * 0.2);
          if (score < best) {
            best = score;
            type = s.type;
          }
        }
        if (best > 1.3) type = 'residential';
      }

      const core = coreDist(c);
      const manhattan = land.name === MAP.denseArea;
      let density: number;
      if (core < 500) density = manhattan ? 4 : 3;
      else if (core < 1000) density = manhattan ? 3 : 2;
      else if (core < 1700) density = manhattan ? 2 : rand() < 0.8 ? 1 : 0;
      else if (core < 2500) density = rand() < 0.3 ? 1 : 0;
      else density = rand() < 0.08 ? 1 : 0;
      if (manhattan) density = Math.max(2, density);
      if (type === 'hospital' || type === 'school') density = Math.max(density, 2);
      cells.push({ id: id++, x, y, w: CELL - gap, h: CELL - gap, type, density });
    }
  }

  const stations = siteOrder().slice(0, INITIAL_STATIONS).map((s, i) => makeStation(i + 1, s));
  return {
    version: SAVE_VERSION,
    seed,
    cityName: MAP.city,
    time: 6 * 60,
    money: 5000,
    satisfaction: 70,
    reputation: 60,
    level: 1,
    mapId: MAP.id,
    cells,
    stations,
    lines: [],
    trains: [],
    events: [],
    requests: [],
    nextSite: INITIAL_STATIONS,
    goalsDone: [],
    log: [{ t: 6 * 60, text: MAP.welcome }],
    stats: { delivered: 0, lost: 0, incomeToday: 0, expensesToday: 0, lastDayIncome: 0, lastDayExpenses: 0 },
    difficulty: 'easy',
    nextId: INITIAL_STATIONS + 1,
  };
}

/** Porta un salvataggio della prima versione al formato attuale. */
export function migrate(s: GameState): GameState {
  s.mapId ??= 'nyc';
  if (s.version === 1) {
    s.reputation = 60;
    s.requests = [];
    s.nextSite = INITIAL_STATIONS;
    for (const st of s.stations) Object.assign(st, { crowd: 0, discontent: 0, openedAt: 0 });
    s.version = SAVE_VERSION;
  }
  return s;
}
