import {
  BUYBACK_FROM, COMPENSATION_BELOW, COMPENSATION_PER_POINT, COST, CRISIS_FINE, DISCONTENT_MINUTES, DONATION_BASE,
  DONATION_REP, SEIZE_BELOW, DWELL, FARE_BASE, FARE_PER_HOP, GRANT_PER_REP, LEVELS, LINE_COLORS, MAX_WAIT,
  MIN_REP_FOR_STATIONS, MAX_CARS, WAGON_COST, wagonUpkeep, demandMult, stationUpkeep, trainUpkeep, OVERCROWD_AT, OVERCROWD_LIMIT, costMult, fareShare, POP_PER_DENSITY, RAMP_DAYS, STATION_CAPACITY, TRAIN_SPEED, ZONES, ZONE_TYPES,
  demandProfile,
} from './config';
import { Network } from './network';
import { landAt } from './maps';
import type { GameEvent, GameState, Line, MayorRequest, Passenger, Station, Train, ZoneType } from './types';
import { siteOrder, makeStation } from './world';

/** Passeggeri generati per punto di densità al minuto (prima dei moltiplicatori orari). */
const DEMAND_K = 0.006;
/** massimo di minuti che un treno aspetta in stazione per ritrovare la distanza dal precedente */
const MAX_HOLD = 12;

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
  /** avvisi importanti che mettono in pausa il gioco */
  onAlert: (title: string, html: string) => void = () => {};

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

  /** Il sindaco approva il prossimo sito in elenco: la stazione compare già costruita. */
  approveStation(): Station | null {
    const s = this.state;
    const order = siteOrder();
    while (s.nextSite < order.length) {
      const site = order[s.nextSite++];
      if (s.stations.some((st) => Math.hypot(st.x - site.x, st.y - site.y) < 120)) continue;
      const st = makeStation(this.id(), site);
      s.stations.push(st);
      this.net.rebuild();
      this.log(`🏛️ Il sindaco ha aperto il cantiere di una nuova stazione: ${st.name}`, 'good');
      this.onChange();
      return st;
    }
    return null;
  }

  stationLinked(id: number) {
    return (this.net.linesAt.get(id)?.length ?? 0) > 0;
  }

  /** Effetto della fiducia del sindaco sui costi di costruzione. */
  get costMult() {
    return costMult(this.state.reputation);
  }

  get trainCost() {
    return Math.round(COST.train * this.costMult);
  }

  /** Costo di un vagone in più su tutti i treni della linea. */
  wagonCost(line: Line) {
    const trains = this.state.trains.filter((t) => t.lineId === line.id).length;
    return Math.round(WAGON_COST * trains * this.costMult);
  }

  /** Costo di un treno nuovo per questa linea, vagoni compresi. */
  lineTrainCost(line: Line) {
    return this.trainCost + Math.round(WAGON_COST * ((line.cars ?? 1) - 1) * this.costMult);
  }

  addCar(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || line.seized) return;
    if ((line.cars ?? 1) >= MAX_CARS) {
      this.onNotify(`I treni della ${line.name} hanno già ${MAX_CARS} vagoni`, 'bad');
      return;
    }
    if (!this.spend(this.wagonCost(line), 'i vagoni')) return;
    line.cars = (line.cars ?? 1) + 1;
    this.onNotify(`${line.name}: ora ogni treno ha ${line.cars} vagoni (${this.capacityOf(line)} posti)`, 'good');
    this.onChange();
  }

  removeCar(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line || line.seized || (line.cars ?? 1) <= 1) return;
    line.cars = (line.cars ?? 1) - 1;
    this.onChange();
  }

  capacityOf(line: Line) {
    return this.levelInfo.trainCapacity * (line.cars ?? 1);
  }

  detourCost(a: number, via: number, b: number) {
    const extra = this.net.trackCost([a, via, b]).cost - this.net.trackCost([a, b]).cost;
    return Math.round(Math.max(0, extra) * this.costMult);
  }

  /** Le stazioni di una linea presa dal Comune non si possono collegare. */
  stationLocked(id: number) {
    return this.state.lines.some((l) => l.seized && l.stations.includes(id));
  }

  donationCost() {
    return Math.round(DONATION_BASE * this.state.level * Math.pow(1.5, this.state.donationsToday ?? 0));
  }

  /** Donazione volontaria al Comune per recuperare fiducia. */
  donate() {
    const s = this.state;
    if (s.reputation >= 100) return;
    const cost = this.donationCost();
    if (!this.spend(cost, 'la donazione')) return;
    s.donationsToday = (s.donationsToday ?? 0) + 1;
    this.changeRep(DONATION_REP);
    this.log(`🤝 Donazione al Comune di $${cost}: fiducia del sindaco +${DONATION_REP}`, 'good');
    this.onChange();
  }

  /** Il Comune prende in gestione la linea con il servizio peggiore (mai l'ultima che hai). */
  private seizeWorstLine() {
    const s = this.state;
    const mine = s.lines.filter((l) => !l.seized);
    if (mine.length < 2) return;
    const score = (l: Line) => {
      const sts = l.stations.map((id) => this.net.stationById.get(id)!);
      return sts.reduce((a, st) => a + st.waiting.length + st.crowd / 10, 0) / sts.length;
    };
    const worst = mine.sort((a, b) => score(b) - score(a))[0];
    for (const t of s.trains.filter((t) => t.lineId === worst.id)) this.dropPassengers(t);
    worst.seized = true;
    this.net.rebuild();
    this.log(`🏛️ Il sindaco ha preso in gestione la ${worst.name}: non puoi usarla né collegarti finché non la riscatti (fiducia ${BUYBACK_FROM}+)`, 'bad');
    const names = worst.stations.map((id) => this.net.stationById.get(id)!.name).join(', ');
    this.onAlert(
      `🏛️ Il sindaco si è preso la ${worst.name}`,
      `<p>La fiducia del sindaco è scesa sotto ${SEIZE_BELOW}: il Comune ha preso in gestione la tua linea con il servizio peggiore (${names}).</p>
      <ul>
        <li>La linea resta sulla mappa, grigia e tratteggiata: i treni girano ma <b>non portano i tuoi passeggeri</b>.</li>
        <li>Non puoi modificarla, aggiungere treni né <b>collegarti alle sue stazioni</b> con altre linee.</li>
        <li>Quando la fiducia torna almeno a <b>${BUYBACK_FROM}</b> puoi riscattarla a pagamento dal pannello della linea.</li>
      </ul>
      <p>Per recuperare fiducia: collega più stazioni, evita il sovraffollamento, completa le richieste del sindaco o fai una donazione al Comune (pannello Obiettivi).</p>`,
    );
    this.onChange();
  }

  buybackCost(line: Line) {
    const trains = this.state.trains.filter((t) => t.lineId === line.id).length;
    return Math.round((this.net.trackCost(line.stations).cost + trains * COST.train * 0.8) * this.costMult);
  }

  buyback(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (!line?.seized) return;
    if (this.state.reputation < BUYBACK_FROM) {
      this.onNotify(`Il sindaco accetta di trattare solo con fiducia almeno ${BUYBACK_FROM}`, 'bad');
      return;
    }
    if (!this.spend(this.buybackCost(line), 'il riscatto')) return;
    line.seized = false;
    this.net.rebuild();
    this.markOpened();
    this.log(`🔑 Hai riscattato la ${line.name}: torna nella tua rete`, 'good');
    this.onChange();
  }

  canAddLine(): boolean {
    return this.state.lines.length < this.levelInfo.maxLines;
  }

  /** Costo per creare/estendere una linea con le stazioni date (in ordine). */
  quote(stations: number[], isNew: boolean): { cost: number; tunnels: number } {
    const t = this.net.trackCost(stations);
    return { cost: Math.round((t.cost + (isNew ? COST.train : 0)) * this.costMult), tunnels: t.tunnels };
  }

  createLine(stations: number[]): Line | null {
    if (stations.length < 2) return null;
    if (stations.some((id) => this.stationLocked(id))) {
      this.onNotify('Non puoi collegarti alle stazioni di una linea gestita dal Comune', 'bad');
      return null;
    }
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
    this.markOpened();
    this.state.trains.push(this.makeTrain(line));
    this.log(`${line.name} inaugurata (${stations.length} fermate)`, 'good');
    this.onChange();
    return line;
  }

  /** Aggiunge stazioni a un capolinea (atEnd=false: all'inizio). */
  extendLine(lineId: number, added: number[], atEnd: boolean): boolean {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return false;
    }
    if (!line || !added.length) return false;
    const anchor = atEnd ? line.stations[line.stations.length - 1] : line.stations[0];
    if (added.some((id) => this.stationLocked(id))) {
      this.onNotify('Non puoi collegarti alle stazioni di una linea gestita dal Comune', 'bad');
      return false;
    }
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
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return false;
    }
    if (!line || line.stations.includes(stationId) || this.stationLocked(stationId)) return false;
    const a = line.stations[idx];
    const b = line.stations[idx + 1];
    if (!this.spend(this.detourCost(a, stationId, b), 'la deviazione')) return false;
    const before = this.snapshotTrains(line);
    line.stations.splice(idx + 1, 0, stationId);
    this.afterLineChange(line, before);
    return true;
  }

  removeStationFromLine(lineId: number, stationId: number, silent = false) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return ;
    }
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
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return ;
    }
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
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return ;
    }
    if (!line) return;
    const others = this.state.trains.filter((t) => t.lineId === line.id);
    if (others.length >= this.levelInfo.maxTrains) {
      this.onNotify(`${line.name} ha già ${this.levelInfo.maxTrains} treni, il massimo per il livello ${this.state.level}: sali di livello per aggiungerne`, 'bad');
      return;
    }
    if (!this.spend(this.lineTrainCost(line), 'un nuovo treno')) return;
    const t = this.makeTrain(line);
    if (others.length) {
      // il nuovo treno entra a metà del buco più grande tra i treni esistenti
      const cycle = this.cycle(line);
      const phases = others.map((o) => this.phase(o, line)).sort((a, b) => a - b);
      let best = 0;
      let at = 0;
      phases.forEach((p, i) => {
        const gap = i + 1 < phases.length ? phases[i + 1] - p : phases[0] + cycle - p;
        if (gap > best) {
          best = gap;
          at = p + gap / 2;
        }
      });
      this.placeAtPhase(t, line, at % cycle);
    }
    this.state.trains.push(t);
    this.onChange();
  }

  removeTrain(lineId: number) {
    const line = this.state.lines.find((l) => l.id === lineId);
    if (line?.seized) {
      this.onNotify(`${line.name} è in gestione al Comune: riscattala per modificarla`, 'bad');
      return ;
    }
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

  /** Lunghezza di un giro completo (andata e ritorno) della linea. */
  private cycle(line: Line): number {
    const g = this.net.geom.get(line.id)!;
    return 2 * g.stationDist[g.stationDist.length - 1];
  }

  /** Posizione del treno sul giro completo: l'andata va da 0 a L, il ritorno da L a 2L. */
  private phase(t: Train, line: Line): number {
    const c = this.cycle(line);
    return t.dir === 1 ? t.pos : c - t.pos;
  }

  /** Mette il treno nel punto del giro indicato, diretto alla fermata successiva. */
  private placeAtPhase(t: Train, line: Line, phase: number) {
    const g = this.net.geom.get(line.id)!;
    const c = this.cycle(line);
    const last = g.stationDist.length - 1;
    t.dir = phase < c / 2 ? 1 : -1;
    t.pos = t.dir === 1 ? phase : c - phase;
    if (t.dir === 1) {
      const i = g.stationDist.findIndex((d) => d >= t.pos);
      t.target = i < 0 ? last : i;
    } else {
      let i = 0;
      g.stationDist.forEach((d, k) => {
        if (d <= t.pos) i = k;
      });
      t.target = i;
    }
    t.dwell = 0;
    t.held = undefined;
  }

  /** Ridistribuisce i treni della linea a distanze uguali, mantenendo l'ordine. */
  private respace(line: Line) {
    const trains = this.state.trains.filter((t) => t.lineId === line.id);
    if (!trains.length) return;
    const c = this.cycle(line);
    const sorted = trains.map((t) => ({ t, p: this.phase(t, line) })).sort((a, b) => a.p - b.p);
    const base = sorted[0].p;
    sorted.forEach(({ t }, k) => this.placeAtPhase(t, line, (base + (k * c) / sorted.length) % c));
  }

  /** Distanza, lungo il giro, dal treno che precede sulla stessa linea. */
  private gapAhead(t: Train, line: Line): number {
    const c = this.cycle(line);
    const me = this.phase(t, line);
    let best = c;
    for (const o of this.state.trains) {
      if (o === t || o.lineId !== t.lineId) continue;
      let gap = (((this.phase(o, line) - me) % c) + c) % c;
      if (gap === 0) gap = o.id < t.id ? 0 : c;
      best = Math.min(best, gap);
    }
    return best;
  }

  private snapshotTrains(line: Line) {
    return this.state.trains
      .filter((t) => t.lineId === line.id)
      .map((t) => ({ t, stationId: line.stations[t.target] }));
  }

  /** Registra quando una stazione entra in servizio: da lì la domanda cresce gradualmente. */
  private markOpened() {
    for (const st of this.state.stations) {
      if (st.openedAt === undefined && this.stationLinked(st.id)) st.openedAt = this.state.time;
    }
  }

  private afterLineChange(line: Line, before: { t: Train; stationId: number }[]) {
    this.net.rebuild();
    this.markOpened();
    const g = this.net.geom.get(line.id)!;
    for (const { t, stationId } of before) {
      // il treno riparte dalla fermata verso cui era diretto
      let idx = line.stations.indexOf(stationId);
      if (idx < 0) idx = Math.min(t.target, line.stations.length - 1);
      t.target = idx;
      t.pos = g.stationDist[idx];
      t.dwell = 0;
    }
    // la linea è cambiata: si riparte con i treni a distanze uguali
    this.respace(line);
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
    this.urgency(dt);
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
      const ramp = Math.min(1, 0.15 + (0.85 * (s.time - (st.openedAt ?? s.time))) / (RAMP_DAYS * 1440));
      for (const cid of this.net.catchment.get(st.id) ?? []) {
        const c = byId.get(cid)!;
        if (!c.density) continue;
        const prof = demandProfile(c.type, hour);
        let rate = c.density * prof.rate * DEMAND_K * demandMult(s.level) * dt * ramp;
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
    if (t.held !== undefined) {
      // regolazione: se il treno precedente è troppo vicino si aspetta un po' in stazione
      const n = this.state.trains.filter((o) => o.lineId === line.id).length;
      if (n > 1 && t.held < MAX_HOLD && this.gapAhead(t, line) < (0.9 * this.cycle(line)) / n) {
        t.held += 1;
        t.dwell = 1;
        return;
      }
      t.held = undefined;
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
    t.held = 0;
    if (line.seized) return; // gestita dal Comune: i treni girano ma non servono la tua rete
    if (this.activeEvents('works').some((e) => e.stationId === st.id)) return; // fermata chiusa: transita

    let moved = 0;
    const stay: Passenger[] = [];
    for (const p of t.passengers) {
      const here = this.net.hopsTo(p.dest, st.id);
      if (here === 0) {
        const fare = Math.round((FARE_BASE + FARE_PER_HOP * p.hops) * fareShare(s.reputation));
        s.money += fare;
        s.stats.incomeToday += fare;
        s.stats.delivered++;
        st.served++;
        for (const r of s.requests) if (r.kind === 'deliver' && r.zone === p.dest) r.progress++;
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

    const cap = this.capacityOf(line);
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
    this.checkRequests();
    this.maybeRequest();
    // ogni mattina il sindaco approva una nuova stazione
    if (Math.floor(s.time / 60) % 24 === 6 && s.time > 1440) {
      if (s.reputation >= MIN_REP_FOR_STATIONS) this.approveStation();
      else this.log(`🏛️ Il sindaco blocca i nuovi cantieri: la sua fiducia è sotto ${MIN_REP_FOR_STATIONS}`, 'bad');
    }
    // di notte, con poca gente in giro, le linee ripartono con i treni equidistanziati
    if (Math.floor(s.time / 60) % 24 === 3) for (const line of s.lines) this.respace(line);
    this.onChange();
  }

  private grow() {
    const s = this.state;
    const byId = new Map(s.cells.map((c) => [c.id, c]));
    const sat = s.satisfaction / 100;
    let changed = false;
    for (const st of s.stations) {
      if (!this.net.linesAt.get(st.id)?.length) continue;
      if (st.frozenUntil && s.time < st.frozenUntil) {
        st.served = 0;
        continue;
      }
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

  private get hard() {
    return this.state.difficulty === 'normal';
  }

  changeRep(delta: number) {
    this.state.reputation = Math.max(0, Math.min(100, this.state.reputation + delta));
  }

  /** Conti alla rovescia: sovraffollamento delle stazioni e malcontento di quelle scollegate. */
  private urgency(dt: number) {
    const s = this.state;
    const byId = new Map(s.cells.map((c) => [c.id, c]));
    const fill = DISCONTENT_MINUTES[this.hard ? 'normal' : 'easy'];
    for (const st of s.stations) {
      if (this.stationLinked(st.id)) {
        st.discontent = Math.max(0, st.discontent - dt * 0.2);
        // dopo una crisi il quartiere è già "in castigo" per un giorno: niente nuove crisi lì nel frattempo
        const cooling = (st.frozenUntil ?? 0) > s.time;
        if (st.waiting.length >= OVERCROWD_AT && !cooling) st.crowd += dt;
        else st.crowd = Math.max(0, st.crowd - dt * 0.5);
        if (st.crowd >= OVERCROWD_LIMIT) this.crowdCrisis(st, byId);
      } else {
        // più gente abita vicino, più in fretta cresce la protesta
        const pop = (this.net.catchment.get(st.id) ?? []).reduce((a, id) => a + (byId.get(id)?.density ?? 0), 0);
        st.discontent += (dt / fill) * 100 * Math.min(1.6, Math.max(0.4, pop / 40));
        if (st.discontent >= 100) {
          st.discontent = 0;
          this.changeRep(this.hard ? -5 : -3);
          this.log(`📣 Gli abitanti di ${st.name} protestano: vogliono la metro! Fiducia del sindaco in calo`, 'bad');
        }
      }
    }
  }

  private crowdCrisis(st: Station, byId: Map<number, GameState['cells'][number]>) {
    const s = this.state;
    st.crowd = 0;
    s.stats.lost += st.waiting.length;
    st.waiting = [];
    st.frozenUntil = s.time + 1440;
    s.satisfaction *= 0.85;
    this.changeRep(this.hard ? -6 : -3);
    const fine = CRISIS_FINE + 200 * (s.level - 1);
    s.money -= fine;
    s.stats.expensesToday += fine;
    // il quartiere perde un po' di attrattiva
    const cells = (this.net.catchment.get(st.id) ?? []).map((id) => byId.get(id)!).filter((c) => c.density > 1);
    for (let i = 0; i < 2 && cells.length; i++) cells.splice(Math.floor(Math.random() * cells.length), 1)[0].density--;
    this.net.rebuild();
    this.log(`🚨 Crisi a ${st.name}: stazione sovraffollata troppo a lungo. Multa del Comune $${fine}, il quartiere smette di crescere per un giorno`, 'bad');
  }

  private maybeRequest() {
    const s = this.state;
    if (s.requests.length >= 2 || !s.lines.length) return;
    const last = Math.max(0, ...s.requests.map((r) => r.deadline - 2 * 1440));
    if (s.time - last < 360 || Math.random() > (s.requests.length ? 0.04 : 0.12)) return;
    const unlinked = s.stations.filter((st) => !this.stationLinked(st.id) && !s.requests.some((r) => r.stationId === st.id));
    let req: MayorRequest;
    if (unlinked.length && Math.random() < 0.6) {
      // di solito chiede di collegare la stazione più recente
      const st = unlinked[unlinked.length - 1 - Math.floor(Math.random() * Math.min(2, unlinked.length))];
      req = {
        id: this.id(), kind: 'connect', stationId: st.id, title: `Collega ${st.name}`,
        target: 1, progress: 0, deadline: s.time + 2 * 1440, reward: 1500 + 300 * s.level, rep: 8,
      };
    } else {
      const zones = ZONE_TYPES.filter((z) => z !== 'residential' && s.stations.some((st) => this.stationLinked(st.id) && this.net.serves.get(st.id)?.has(z)));
      if (!zones.length) return;
      const zone = zones[Math.floor(Math.random() * zones.length)];
      const target = 25 + 15 * s.level;
      req = {
        id: this.id(), kind: 'deliver', zone, title: `Porta ${target} persone verso ${ZONES[zone].label.toLowerCase()}`,
        target, progress: 0, deadline: s.time + 1.5 * 1440, reward: 1200 + 300 * s.level, rep: 6,
      };
    }
    s.requests.push(req);
    this.log(`🏛️ Richiesta del sindaco: ${req.title} entro ${Math.round((req.deadline - s.time) / 60)} ore`, 'info');
  }

  private checkRequests() {
    const s = this.state;
    s.requests = s.requests.filter((r) => {
      if (r.kind === 'connect' && r.stationId !== undefined) r.progress = this.stationLinked(r.stationId) ? 1 : 0;
      if (r.progress >= r.target) {
        s.money += r.reward;
        s.stats.incomeToday += r.reward;
        this.changeRep(r.rep);
        this.log(`✅ Richiesta completata: ${r.title} (+$${r.reward}, fiducia +${r.rep})`, 'good');
        return false;
      }
      if (s.time >= r.deadline) {
        this.changeRep(-r.rep - 2);
        this.log(`⌛ Richiesta scaduta: ${r.title}. Il sindaco è deluso`, 'bad');
        return false;
      }
      return true;
    });
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
      this.approveStation();
      this.approveStation();
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
    const myTrains = s.trains.filter((t) => !s.lines.find((l) => l.id === t.lineId)?.seized).length;
    const wagons = s.trains.reduce((a, t) => {
      const l = s.lines.find((x) => x.id === t.lineId);
      return a + (l && !l.seized ? (l.cars ?? 1) - 1 : 0);
    }, 0);
    const upkeep = myTrains * trainUpkeep(s.level) + wagons * wagonUpkeep(s.level) + s.stations.length * stationUpkeep(s.level);
    s.money -= upkeep;
    s.stats.expensesToday += upkeep;
    // il sindaco giudica il servizio della giornata: copertura delle stazioni e soddisfazione
    const linked = s.stations.filter((st) => this.stationLinked(st.id)).length;
    const coverage = s.stations.length ? linked / s.stations.length : 0;
    const drift = Math.round(Math.max(-4, Math.min(6, (coverage - 0.5) * 10 + (s.satisfaction - 60) / 8)));
    this.changeRep(drift);
    // sopra soglia il Comune ti dà un contributo, sotto soglia sei tu a pagare una compensazione
    const grant = s.reputation >= COMPENSATION_BELOW
      ? Math.round(s.reputation * GRANT_PER_REP)
      : -Math.round((COMPENSATION_BELOW - s.reputation) * COMPENSATION_PER_POINT);
    s.money += grant;
    if (grant >= 0) s.stats.incomeToday += grant;
    else {
      s.stats.expensesToday -= grant;
      this.changeRep(2); // la compensazione ammorbidisce un po' il sindaco
    }
    s.donationsToday = 0;
    if (s.reputation < SEIZE_BELOW) this.seizeWorstLine();
    s.stats.lastDayIncome = s.stats.incomeToday;
    s.stats.lastDayExpenses = s.stats.expensesToday;
    s.stats.incomeToday = 0;
    s.stats.expensesToday = 0;
    this.unmet.clear();
    const day = Math.floor(s.time / 1440) + 1;
    this.log(`Inizia il giorno ${day}. Giudizio del sindaco: ${drift >= 0 ? '+' : ''}${drift} fiducia (${Math.round(coverage * 100)}% stazioni collegate). ${grant >= 0 ? `Contributo del Comune: $${grant}` : `Compensazione pagata al Comune: $${-grant}`}. Ieri: incassi $${s.stats.lastDayIncome}, spese $${s.stats.lastDayExpenses}`);
  }
}

function pickWeighted<T extends string>(w: Partial<Record<T, number>>): T | null {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) if ((r -= v) <= 0) return k;
  return entries.length ? entries[entries.length - 1][0] : null;
}
