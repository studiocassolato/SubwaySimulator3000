import { CELL } from './config';
import { rng } from './geometry';
import { CENTRAL_PARK, CORES, SEEDS, WORLD_H, WORLD_W, landAt, pointInPoly } from './nyc';
import type { Cell, GameState, Vec, ZoneType } from './types';

export const SAVE_VERSION = 1;

/** Distanza minima di un punto dal bordo dell'acqua (approssimata a campioni). */
function nearWater(c: Vec, r: number): boolean {
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    if (!landAt({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r })) return true;
  }
  return false;
}

export function newGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const rand = rng(seed);
  const cells: Cell[] = [];
  let id = 1;
  const gap = 10;
  for (let gy = 0; gy * CELL < WORLD_H; gy++) {
    for (let gx = 0; gx * CELL < WORLD_W; gx++) {
      const x = gx * CELL + gap / 2;
      const y = gy * CELL + gap / 2;
      const c = { x: x + CELL / 2 - gap / 2, y: y + CELL / 2 - gap / 2 };
      const land = landAt(c);
      if (!land || nearWater(c, CELL * 0.42)) continue;
      if (rand() < 0.05) continue;

      let type: ZoneType = 'residential';
      if (pointInPoly(c, CENTRAL_PARK)) {
        type = 'leisure';
      } else {
        let best = Infinity;
        for (const s of SEEDS) {
          const score = (Math.hypot(s.x - c.x, s.y - c.y) / s.r) * (0.9 + rand() * 0.2);
          if (score < best) {
            best = score;
            type = s.type;
          }
        }
        if (best > 1.3) type = 'residential';
      }

      const core = Math.min(...CORES.map((k) => Math.hypot(k.x - c.x, k.y - c.y)));
      const manhattan = land.name === 'MANHATTAN';
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

  return {
    version: SAVE_VERSION,
    seed,
    cityName: 'New York',
    time: 6 * 60,
    money: 8000,
    satisfaction: 70,
    level: 1,
    mapId: 'nyc',
    cells,
    stations: [],
    lines: [],
    trains: [],
    events: [],
    goalsDone: [],
    log: [{ t: 6 * 60, text: 'Benvenuto a New York! Piazza le stazioni e collegale con le linee.' }],
    stats: { delivered: 0, lost: 0, incomeToday: 0, expensesToday: 0, lastDayIncome: 0, lastDayExpenses: 0 },
    difficulty: 'easy',
    nextId: 1,
  };
}

export function nearestSeedName(p: Vec, used: Set<string>): string {
  const sorted = [...SEEDS].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  for (const s of sorted.slice(0, 3)) if (!used.has(s.name)) return s.name;
  const base = sorted[0].name;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}
