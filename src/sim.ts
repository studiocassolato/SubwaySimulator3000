import {
  COST, DWELL, FARE_BASE, FARE_PER_HOP, LEVELS, LINE_COLORS, MAX_WAIT, POP_PER_DENSITY,
  STATION_CAPACITY, TRAIN_SPEED, ZONES, demandProfile,
} from './config';
import { Network } from './network';
import { landAt } from './nyc';
import type { GameEvent, GameState, Line, Passenger, Station, Train, ZoneType } from './types';
import { nearestSeedName } from './world';

/** Passeggeri generati per punto di densità al minuto (prima dei moltiplicatori orari). */
const DEMAND_K = 0.006;

export type Notify = (text: string, kind?: 'info' | 'good' | 'bad') => void;

export interface Goal {
  id: string;
  text: string;
  reward: number;
  done: (g: Game) => boolean;
}

export const GOALS: Goal[] = [
  { id: 'first-line', text: 'Apri la prima linea', reward: 500, done: (g) => g.state.lines.length >= 1 },
  {
    id: 'commute', text: 'Collega una zona residenziale a una di uffici', reward: 800,
    done: (g) => g.state.stations.some((s) => g.net.serves.get(s.id)?.has('residential') && g.net.hopsTo('offices', s.id) > 0 && g.net.hopsTo('offices', s.id) < Infinity),
  },
  { id: 'deliver-100', text: 'Trasporta 100 passeggeri', reward: 1000, done: (g) => g.state.stats.delivered >= 100 },
  { id: 'tunnel', text: 'Attraversa un fiume con una galleria', reward: 1200, done: (g) => g.state.lines.some((l) => g.net.lineHasTunnel(l.id)) },
  {
    id: 'hospital', text: 'Servi un ospedale con la metro', reward: 1000,
    done: (g) => g.state.stations.some((s) => g.net.serves.get(s.id)?.has('hospital') && (g.net.linesAt.get(s.id)?.length ?? 0) > 0),
  },
  {
    id: 'boroughs', text: 'Collega 3 distretti diversi', reward: 2000,
    done: (g) => new Set(g.state.stations.filter((s) => (g.net.linesAt.get(s.id)?.length ?? 0) > 0).map((s) => landAt(s)?.name)).size >= 3,
  },
  { id: 'deliver-1000', text: 'Trasporta 1.000 passeggeri', reward: 3000, done: (g) => g.state.stats.delivered >= 1000 },
  { id: 'level-3', text: 'Raggiungi il livello 3', reward: 4000, done: (g) => g.state.level >= 3 },
  { id: 'deliver-10000', text: 'Trasporta 10.000 passeggeri', reward: 10000, done: (g) => g.state.stats.delivered >= 10000 },
];

export class Game {
  net: Network;
  /** passeggeri che non trovano un percorso, per stazione (indicatore per il giocatore) */
  unmet = new Map<number, Map<ZoneType, number>>();
  speed = 1;
  paused = false;
  onNotify: Notify = () => {};
  onChange: () => void = () => {};

  constructor(public state: GameState) {
    this.net = new Network(state);
  }

  load(state: GameState) {
    this.state = state;
    this.net.setState(state);
    this.unmet.clear();
    this.onChange();
  }

  private id() {
    return this.state.nextId++;
  }

  log(text: string, kind: 'info' | 'good' | 'bad' = 'info') {
    this.state.log.unshift({ t: this.state.time, text });
    this.state.log.length = Math.min(this.state.log.length, 40);
    this.onNotify(text, kind);
  }

  spend(amount: number, what: string): boolean {
    if (this.state.money < amount) {
      this.onNotify(`Fondi insufficienti per ${what} (servono $${amount})`, 'bad');
      return false;
    }
    this.state.money -= amount;
    this.state.stats.expensesToday += amount;
    return true;
  }

  get levelInfo() {
    return LEVELS[this.state.level - 1];
  }

  /** Abitanti e addetti negli isolati serviti da stazioni collegate. */
  servedPopulation(): number {
    let pop = 0;
    const byId = new Map(this.state.cells.map((c) => [c.id, c]));
    for (const st of this.state.stations) {
      if (!this.net.linesAt.get(st.id)?.length) continue;
      for (const cid of this.net.catchment.get(st.id) ?? []) {
        const c = byId.get(cid)!;
        pop += c.density * POP_PER_DENSITY[c.type];
      }
    }
    return pop;
  }

  // ---------- azioni del giocatore ----------

  addStation(x: number, y: number): Station | null {
    if (!landAt({ x, y })) {
      this.onNotify('Le stazioni vanno costruite sulla terraferma', 'bad');
      return null;
    }
    if (this.state.stations.some((s) => Math.hypot(s.x - x, s.y - y) < 90)) {
      this.onNotify('Troppo vicina a un\'altra stazione', 'bad');
      return null;
    }
    if (!this.spend(COST.station, 'la stazione')) return null;
    const used = new Set(this.state.stations.map((s) => s.name));
    const st: Station = { id: this.id(), x, y, name: nearestSeedName({ x, y }, used), waiting: [], served: 0 };
    this.state.stations.push(st);
    this.net.rebuild();
    this.onChange();
    return st;
  }

  removeStation(id: number) {
    const st = this.net.stationById.get(id);
    if (!st) return;
    for (const line of [...this.state.lines]) {
      if (line.stations.includes(id)) this.removeStationFromLine(line.id, id, true);
    }
    this.state.stations = this.state.stations.filter((s) => s.id !== id);
    this.state.money += Math.round(COST.station / 2);
    this.net.rebuild();
    this.onChange();
  }

  canAddLine(): boolean {
    return this.state.lines.length < this.levelInfo.maxLines;
  }

  /** Costo per creare/estendere una linea con le stazioni date (in ordine). */
  quote(stations: number[], isNew: boolean): { cost: number; tunnels: number } {
    const t = this.net.trackCost(stations);
    return { cost: t.cost + (isNew ? COST.train : 0), tunnels: t.tunnels };
  }

  createLine(stations: number[]): Line | null {
    if (stations.length < 2) return null;
    if (!this.canAddLine()) {
      this.onNotify(`Hai già ${this.levelInfo.maxLines} linee: sali di livello per averne altre`, 'bad');
      return null;
    }
    const q = this.quote(stations, true);
    if (!this.spend(q.cost, 'la linea')) return null;
    const usedColors = new Set(this.state.lines.map((l) => l.color));
    const color = LINE_COLORS.find((c) => !usedColors.has(c)) ?? LINE_COLORS[this.state.lines.length % LINE_COLORS.length];
    const n = LINE_COLORS.indexOf(color) + 1;
    const line: Line = { id: this.id(), color, name: `Linea ${n}`, stations: [...stations] };
    this.state.lines.push(line);
    this.net.rebuild();
    this.state.trains.push(this.makeTrain(line));
    this.log(`${line.name} inaugurata (${stations.length} fermate)`, 'good');
    this.onChange();
    return line;
  }

  /** Aggiunge stazioni a un capolinea (atEnd=false: all'inizio). */
  extendLine(lineId: number, added: number[], atEnd: boolean): boolean {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || !added.length) return false;
    const anchor = atEnd ? line.stations[line.stations.length - 1] : line.stations[0];
    const q = this.quote([anchor, ...added], false);
    if (!this.spend(q.cost, 'il prolungamento')) return false;
    const before = this.snapshotTrains(line);
    if (atEnd) line.stations.push(...added);
    else line.stations.unshift(...[...added].reverse());
    this.afterLineChange(line, before);
    return true;
  }

  /** Inserisce una stazione tra le fermate idx e idx+1. */
  insertStation(lineId: number, idx: number, stationId: number): boolean {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || line.stations.includes(stationId)) return false;
    const a = line.stations[idx];
    const b = line.stations[idx + 1];
    const oldCost = this.net.trackCost([a, b]).cost;
    const newCost = this.net.trackCost([a, stationId, b]).cost;
    if (!this.spend(Math.max(0, newCost - oldCost), 'la deviazione')) return false;
    const before = this.snapshotTrains(line);
    line.stations.splice(idx + 1, 0, stationId);
    this.afterLineChange(line, before);
    return true;
  }

  removeStationFromLine(lineId: number, stationId: number, silent = false) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line) return;
    const before = this.snapshotTrains(line);
    line.stations = line.stations.filter((s) => s !== stationId);
    if (line.stations.length < 2) {
      this.deleteLine(line.id, silent);
      return;
    }
    this.afterLineChange(line, before);
  }

  deleteLine(lineId: number, silent = false) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line) return;
    const trains = this.state.trains.filter((t) => t.lineId === lineId);
    for (const t of trains) this.dropPassengers(t);
    this.state.money += Math.round(trains.length * COST.train * 0.5);
    this.state.trains = this.state.trains.filter((t) => t.lineId !== lineId);
    this.state.lines = this.state.lines.filter((l) => l.id !== lineId);
    this.net.rebuild();
    if (!silent) this.log(`${line.name} chiusa`);
    this.onChange();
  }

  addTrain(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || !this.spend(COST.train, 'un nuovo treno')) return;
    this.state.trains.push(this.makeTrain(line));
    this.onChange();
  }

  removeTrain(lineId: number) {
    const trains = this.state.trains.filter((t) => t.lineId === lineId);
    if (trains.length <= 1) {
      this.onNotify('Ogni linea ha bisogno di almeno un treno', 'bad');
      return;
    }
    const t = trains[trains.length - 1];
    this.dropPassengers(t);
    this.state.trains = this.state.trains.filter((x) => x !== t);
    this.state.money += Math.round(COST.train * 0.5);
    this.onChange();
  }

  private makeTrain(line: Line): Train {
    // i treni nuovi partono dal capolinea meno servito
    const others = this.state.trains.filter((t) => t.lineId === line.id);
    const fromEnd = others.length % 2 === 1;
    const g = this.net.geom.get(line.id)!;
    const idx = fromEnd ? line.stations.length - 1 : 0;
    return {
      id: this.id(), lineId: line.id, pos: g.stationDist[idx], dir: fromEnd ? -1 : 1,
      target: idx, dwell: 0, passengers: [], brokenFor: 0,
    };
  }

  private snapshotTrains(line: Line) {
    return this.state.trains
      .filter((t) => t.lineId === line.id)
      .map((t) => ({ t, stationId: line.stations[t.target] }));
  }

  private afterLineChange(line: Line, before: { t: Train; stationId: number }[]) {
    this.net.rebuild();
    const g = this.net.geom.get(line.id)!;
    for (const { t, stationId } of before) {
      // il treno riparte dalla fermata verso cui era diretto
      let idx = line.stations.indexOf(stationId);
      if (idx < 0) idx = Math.min(t.target, line.stations.length - 1);
      t.target = idx;
      t.pos = g.stationDist[idx];
      t.dwell = 0;
    }
    this.onChange();
  }

  private dropPassengers(t: Train) {
    // chi era a bordo viene lasciato alla fermata più vicina
    const line = this.state.lines.find((l) => l.id === t.lineId);
    const st = line && this.net.stationById.get(line.stations[Math.min(t.target, line.stations.length - 1)]);
    if (st) st.waiting.push(...t.passengers.map((p) => ({ ...p, since: this.state.time })));
    t.passengers = [];
  }

  // ---------- simulazione ----------

  /** Avanza di dt minuti di gioco. */
  tick(dt: number) {
    const s = this.state;
    const prevHour = Math.floor(s.time / 60);
    const prevDay = Math.floor(s.time / 1440);
    s.time += dt;
    this.generate(dt);
    for (const t of s.trains) this.moveTrain(t, dt);
    this.expireWaiting();
    if (Math.floor(s.time / 60) !== prevHour) this.hourly();
    if (Math.floor(s.time / 1440) !== prevDay) this.daily();
  }

  private activeEvents(kind: GameEvent['kind']) {
    return this.state.events.filter((e) => e.kind === kind);
  }

  private generate(dt: number) {
    const s = this.state;
    const hour = Math.floor(s.time / 60) % 24;
    const byId = new Map(s.cells.map((c) => [c.id, c]));
    const closed = new Set(this.activeEvents('works').map((e) => e.stationId));
    const peaks = new Set(this.activeEvents('peak').map((e) => e.cellId));
    for (const st of s.stations) {
      if (!this.net.linesAt.get(st.id)?.length || closed.has(st.id)) continue;
      for (const cid of this.net.catchment.get(st.id) ?? []) {
        const c = byId.get(cid)!;
        if (!c.density) continue;
        const prof = demandProfile(c.type, hour);
        let rate = c.density * prof.rate * DEMAND_K * dt;
        if (peaks.has(c.id)) rate *= 5;
        if (Math.random() >= rate) continue;
        const dest = pickWeighted(prof.dest);
        if (!dest) continue;
        const hops = this.net.hopsTo(dest, st.id);
        if (hops === 0) continue; // destinazione raggiungibile a piedi
        if (hops === Infinity) {
          const m = this.unmet.get(st.id) ?? new Map();
          m.set(dest, (m.get(dest) ?? 0) + 1);
          this.unmet.set(st.id, m);
          continue;
        }
        if (st.waiting.length >= STATION_CAPACITY) {
          s.stats.lost++;
          s.satisfaction -= s.satisfaction * 0.01;
          continue;
        }
        st.waiting.push({ dest, since: s.time, hops: 0 });
      }
    }
  }

  private moveTrain(t: Train, dt: number) {
    const line = this.state.lines.find((l) => l.id === t.lineId);
    const g = line && this.net.geom.get(line.id);
    if (!line || !g) return;
    if (t.brokenFor > 0) {
      t.brokenFor = Math.max(0, t.brokenFor - dt);
      return;
    }
    if (t.dwell > 0) {
      t.dwell -= dt;
      return;
    }
    let speed = TRAIN_SPEED;
    if (this.activeEvents('flood').length && this.net.lineHasTunnel(line.id)) speed *= 0.35;
    let budget = speed * dt;
    while (budget > 0) {
      const goal = g.stationDist[t.target];
      const d = goal - t.pos;
      if (Math.abs(d) > budget) {
        t.pos += Math.sign(d) * budget;
        return;
      }
      budget -= Math.abs(d);
      t.pos = goal;
      this.stopAt(t, line);
      if (t.dwell > 0) return;
    }
  }

  private stopAt(t: Train, line: Line) {
    const s = this.state;
    const i = t.target;
    if (i + t.dir < 0 || i + t.dir >= line.stations.length) t.dir = t.dir === 1 ? -1 : 1;
    t.target = i + t.dir;
    const st = this.net.stationById.get(line.stations[i]);
    const next = line.stations[t.target];
    if (!st || next === undefined) return;
    if (this.activeEvents('works').some((e) => e.stationId === st.id)) return; // fermata chiusa: transita

    let moved = 0;
    const stay: Passenger[] = [];
    for (const p of t.passengers) {
      const here = this.net.hopsTo(p.dest, st.id);
      if (here === 0) {
        const fare = Math.round(FARE_BASE + FARE_PER_HOP * p.hops);
        s.money += fare;
        s.stats.incomeToday += fare;
        s.stats.delivered++;
        st.served++;
        s.satisfaction += (100 - s.satisfaction) * 0.01;
        moved++;
      } else if (this.net.hopsTo(p.dest, next) >= here) {
        // conviene cambiare linea qui
        st.waiting.push({ ...p, since: s.time });
        moved++;
      } else {
        p.hops++;
        stay.push(p);
      }
    }
    t.passengers = stay;

    const cap = this.levelInfo.trainCapacity;
    const left: Passenger[] = [];
    for (const p of st.waiting) {
      if (t.passengers.length < cap && this.net.hopsTo(p.dest, next) < this.net.hopsTo(p.dest, st.id)) {
        t.passengers.push({ ...p, hops: p.hops + 1 });
        moved++;
      } else {
        left.push(p);
      }
    }
    st.waiting = left;
    t.dwell = DWELL * (moved ? 1 : 0.4);
  }

  private expireWaiting() {
    const s = this.state;
    for (const st of s.stations) {
      if (!st.waiting.length) continue;
      const before = st.waiting.length;
      st.waiting = st.waiting.filter((p) => s.time - p.since < MAX_WAIT);
      const lost = before - st.waiting.length;
      if (lost) {
        s.stats.lost += lost;
        s.satisfaction *= Math.pow(0.99, lost);
      }
    }
  }

  private hourly() {
    const s = this.state;
    s.events = s.events.filter((e) => {
      if (s.time < e.until) return true;
      if (e.kind === 'works') this.net.rebuild();
      this.log(`Terminato: ${e.title}`);
      return false;
    });
    this.grow();
    this.maybeEvent();
    this.checkLevel();
    this.checkGoals();
    this.onChange();
  }

  private grow() {
    const s = this.state;
    const byId = new Map(s.cells.map((c) => [c.id, c]));
    const sat = s.satisfaction / 100;
    let changed = false;
    for (const st of s.stations) {
      if (!this.net.linesAt.get(st.id)?.length) continue;
      const pressure = Math.min(1, st.served / 10) * sat;
      st.served = 0;
      for (const cid of this.net.catchment.get(st.id) ?? []) {
        const c = byId.get(cid)!;
        if (c.density === 0) {
          // terreno vicino a una stazione attiva viene edificato
          if (Math.random() < 0.04 + 0.15 * pressure) {
            c.density = 1;
            changed = true;
          }
        } else if (c.density < 5 && Math.random() < 0.06 * pressure / c.density) {
          c.density++;
          changed = true;
        }
      }
    }
    if (changed) this.net.rebuild();
  }

  private maybeEvent() {
    const s = this.state;
    if (s.difficulty === 'off' || s.events.length >= 2 || !s.lines.length) return;
    const chance = s.difficulty === 'easy' ? 0.05 : 0.11;
    if (Math.random() > chance) return;
    const kinds: GameEvent['kind'][] = ['breakdown', 'peak', 'works'];
    if (s.lines.some((l) => this.net.lineHasTunnel(l.id))) kinds.push('flood');
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const ev: GameEvent = { id: this.id(), kind, title: '', until: s.time + 180 };
    if (kind === 'breakdown') {
      const t = s.trains[Math.floor(Math.random() * s.trains.length)];
      if (!t) return;
      const line = s.lines.find((l) => l.id === t.lineId)!;
      t.brokenFor = 90;
      ev.until = s.time + 90;
      ev.trainId = t.id;
      ev.title = `Guasto a un treno della ${line.name}`;
    } else if (kind === 'flood') {
      ev.until = s.time + 240;
      ev.title = 'Allagamento: i treni in galleria rallentano';
    } else if (kind === 'peak') {
      const served = s.stations.filter((st) => this.net.linesAt.get(st.id)?.length);
      const st = served[Math.floor(Math.random() * served.length)];
      const cells = (this.net.catchment.get(st.id) ?? []).map((id) => s.cells.find((c) => c.id === id)!).filter((c) => c.density > 0);
      const c = cells[Math.floor(Math.random() * cells.length)];
      if (!c) return;
      ev.cellId = c.id;
      ev.stationId = st.id;
      ev.title = `Evento a ${st.name}: picco di passeggeri (${ZONES[c.type].label.toLowerCase()})`;
    } else {
      const served = s.stations.filter((st) => this.net.linesAt.get(st.id)?.length);
      const st = served[Math.floor(Math.random() * served.length)];
      ev.stationId = st.id;
      ev.title = `Cantiere: stazione ${st.name} chiusa`;
    }
    s.events.push(ev);
    if (kind === 'works') this.net.rebuild();
    this.log(ev.title, 'bad');
  }

  checkLevel() {
    const s = this.state;
    const pop = this.servedPopulation();
    let lvl = 1;
    LEVELS.forEach((l, i) => {
      if (pop >= l.population) lvl = i + 1;
    });
    if (lvl > s.level) {
      s.level = lvl;
      this.log(`Livello ${lvl}! ${LEVELS[lvl - 1].unlock}`, 'good');
    }
  }

  checkGoals() {
    for (const goal of GOALS) {
      if (this.state.goalsDone.includes(goal.id) || !goal.done(this)) continue;
      this.state.goalsDone.push(goal.id);
      this.state.money += goal.reward;
      this.state.stats.incomeToday += goal.reward;
      this.log(`Obiettivo raggiunto: ${goal.text} (+$${goal.reward})`, 'good');
    }
  }

  private daily() {
    const s = this.state;
    const upkeep = s.trains.length * COST.trainUpkeepPerDay + s.stations.length * COST.stationUpkeepPerDay;
    s.money -= upkeep;
    s.stats.expensesToday += upkeep;
    s.stats.lastDayIncome = s.stats.incomeToday;
    s.stats.lastDayExpenses = s.stats.expensesToday;
    s.stats.incomeToday = 0;
    s.stats.expensesToday = 0;
    this.unmet.clear();
    const day = Math.floor(s.time / 1440) + 1;
    this.log(`Inizia il giorno ${day}. Ieri: incassi $${s.stats.lastDayIncome}, spese $${s.stats.lastDayExpenses}`);
  }
}

function pickWeighted<T extends string>(w: Partial<Record<T, number>>): T | null {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) if ((r -= v) <= 0) return k;
  return entries.length ? entries[entries.length - 1][0] : null;
}
