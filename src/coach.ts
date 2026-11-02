import type { Camera } from './camera';
import { OVERCROWD_LIMIT } from './config';
import { lineHandles } from './render';
import type { Game } from './sim';
import type { Station } from './types';

/**
 * Tutorial guidato (5 passi, si impara facendo) e suggerimenti che compaiono
 * una sola volta, la prima volta che succede una cosa.
 */

export interface CoachDeps {
  game: Game;
  cam: Camera;
  /** sposta la mappa su una stazione e la seleziona */
  focusStation: (id: number) => void;
  /** apre una scheda del pannello */
  openTab: (tab: 'info' | 'lines' | 'goals' | 'log') => void;
  /** chiamata quando cambia lo stato da ricordare (tutorial finito, suggerimenti visti) */
  save: (done: boolean, seen: string[]) => void;
}

interface Step {
  title: string;
  text: string;
  /** passo completato? (se manca, si va avanti col pulsante) */
  done?: () => boolean;
  /** il tempo resta fermo durante questo passo */
  pause?: boolean;
  enter?: () => void;
}

interface Tip {
  id: string;
  /** stazione a cui si riferisce, oppure true se vale in generale; null se non è il momento */
  when: () => Station | true | null;
  text: (st?: Station) => string;
}

export class Coach {
  private step = -1;
  private tip: { id: string; station?: number } | null = null;
  private seen: Set<string>;
  private done: boolean;
  private box: HTMLElement;
  private lastCheck = 0;
  /** stazioni suggerite per la prima linea */
  hint: number[] = [];
  private startLines = 0;
  private startTrains = 0;

  constructor(private d: CoachDeps, done: boolean, seen: string[]) {
    this.done = done;
    this.seen = new Set(seen);
    this.box = document.querySelector('#coach') as HTMLElement;
    this.box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-c]');
      if (!b) return;
      if (b.dataset.c === 'next') this.next();
      else if (b.dataset.c === 'skip') this.finish();
      else if (b.dataset.c === 'ok') this.closeTip();
      else if (b.dataset.c === 'go' && this.tip?.station !== undefined) {
        this.d.focusStation(this.tip.station);
        this.closeTip();
      }
    });
  }

  get active() {
    return this.step >= 0;
  }

  private get steps(): Step[] {
    const g = this.d.game;
    return [
      {
        title: 'La tua prima linea',
        text: 'Le stazioni le decide il sindaco, tu costruisci le linee. <b>Trascina da una stazione all\'altra</b> (col dito tieni premuto un attimo, poi trascina): ti ho evidenziato due fermate vicine. Il tempo è fermo finché non la costruisci.',
        pause: true,
        enter: () => {
          this.startLines = g.state.lines.length;
          this.hint = this.suggestPair();
        },
        done: () => g.state.lines.length > this.startLines,
      },
      {
        title: 'Passeggeri e treni',
        text: 'Ecco il treno. I <b>pallini colorati</b> sono i passeggeri: ognuno va verso una zona del suo colore (verde case, blu uffici, arancio negozi...). Ogni viaggio completato è un incasso, il "+$" verde.',
        enter: () => {
          if (g.speed === 0) g.speed = 1;
        },
      },
      {
        title: 'Più treni, meno attese',
        text: 'Se la gente si accumula, la stazione si riempie e scatta la crisi. Apri <b>Linee</b> e premi <b>+</b> per aggiungere un treno alla linea.',
        enter: () => {
          this.startTrains = g.state.trains.length;
          this.d.openTab('lines');
        },
        done: () => g.state.trains.length > this.startTrains,
      },
      {
        title: 'Prolunga la linea',
        text: 'Ai capolinea c\'è una piccola <b>T</b>: trascinala verso un\'altra stazione per allungare la linea. Puoi anche trascinare un tratto della linea selezionata su una stazione per fare una deviazione.',
        enter: () => {
          this.startLines = g.state.lines.reduce((n, l) => n + l.stations.length, 0);
        },
        done: () => g.state.lines.reduce((n, l) => n + l.stations.length, 0) > this.startLines,
      },
      {
        title: 'Il sindaco ti osserva',
        text: 'La <b>fiducia 🏛️</b> decide il contributo giornaliero, quanto incassi e quanto costa costruire. Tienila alta rispondendo alle <b>richieste a tempo</b> (compaiono sopra le stazioni con il conto alla rovescia) e collegando i quartieri prima che si arrabbino. Buon lavoro!',
        enter: () => this.d.openTab('goals'),
      },
    ];
  }

  private readonly tips: Tip[] = [
    {
      id: 'request',
      when: () => {
        const r = this.d.game.state.requests.find((q) => q.stationId !== undefined);
        return r ? this.d.game.net.stationById.get(r.stationId!) ?? true : this.d.game.state.requests.length ? true : null;
      },
      text: () => 'Il sindaco ti ha fatto una <b>richiesta a tempo</b>: la trovi in alto con le ore che restano. Se la completi guadagni soldi e fiducia.',
    },
    {
      id: 'crowd',
      when: () => this.d.game.state.stations.find((s) => s.crowd > OVERCROWD_LIMIT * 0.25 && (this.d.game.net.linesAt.get(s.id)?.length ?? 0) > 0) ?? null,
      text: (st) => `<b>${st?.name}</b> è troppo piena: l'anello rosso si chiude verso la crisi. Aggiungi un treno o un vagone, o un'altra linea che passi di lì.`,
    },
    {
      id: 'discontent',
      when: () => this.d.game.state.stations.find((s) => s.discontent > 40 && !(this.d.game.net.linesAt.get(s.id)?.length)) ?? null,
      text: (st) => `I residenti di <b>${st?.name}</b> aspettano la metro: l'anello arancio è il loro malcontento. Collegala prima che arrivi al 100%.`,
    },
    {
      id: 'rep',
      when: () => (this.d.game.state.reputation < 50 ? true : null),
      text: () => 'La <b>fiducia del sindaco</b> è scesa sotto 50: contributi più bassi e costruzioni più care. Completa le sue richieste per recuperarla.',
    },
    {
      id: 'level',
      when: () => (this.d.game.state.level >= 2 ? true : null),
      text: () => 'Sei salito di <b>livello</b>: puoi aprire più linee e avere più treni. In <b>Obiettivi</b> vedi cosa sblocchi dopo.',
    },
  ];

  /** avvia il tutorial (prima partita o "Rivedi il tutorial") */
  start() {
    this.closeTip();
    this.step = 0;
    this.enterStep();
  }

  private enterStep() {
    const s = this.steps[this.step];
    s.enter?.();
    if (s.pause) this.d.game.speed = 0;
    document.body.dataset.coach = String(this.step + 1);
    const last = this.step === this.steps.length - 1;
    this.box.innerHTML = `
      <div class="coach-head"><small>${this.step + 1}/${this.steps.length}</small><b>${s.title}</b></div>
      <p>${s.text}</p>
      <div class="btns">
        ${s.done ? '' : `<button class="btn primary small" data-c="next">${last ? 'Inizia a giocare' : 'Avanti'}</button>`}
        ${last ? '' : '<button class="btn small" data-c="skip">Salta il tutorial</button>'}
      </div>`;
    this.box.hidden = false;
  }

  private next() {
    if (this.step < 0) return;
    this.step++;
    if (this.step >= this.steps.length) return this.finish();
    this.enterStep();
  }

  finish() {
    if (this.step >= 0 && this.d.game.speed === 0) this.d.game.speed = 1;
    this.stop();
    this.done = true;
    this.d.save(this.done, [...this.seen]);
  }

  /** nasconde tutorial e suggerimento senza segnarli come visti (es. caricando una partita) */
  stop() {
    this.step = -1;
    this.hint = [];
    this.tip = null;
    delete document.body.dataset.coach;
    this.box.hidden = true;
  }

  /** da chiamare a ogni fotogramma */
  update(started: boolean) {
    if (!started) return;
    if (this.step >= 0) {
      const s = this.steps[this.step];
      if (s.pause && this.d.game.speed !== 0 && !s.done?.()) this.d.game.speed = 0;
      if (s.done?.()) this.next();
      return;
    }
    const now = performance.now();
    if (this.tip || now - this.lastCheck < 1000) return;
    this.lastCheck = now;
    for (const t of this.tips) {
      if (this.seen.has(t.id)) continue;
      const w = t.when();
      if (!w) continue;
      const st = w === true ? undefined : w;
      this.seen.add(t.id);
      this.d.save(this.done, [...this.seen]);
      this.tip = { id: t.id, station: st?.id };
      this.box.innerHTML = `
        <div class="coach-head"><small>💡 Suggerimento</small></div>
        <p>${t.text(st)}</p>
        <div class="btns">${st ? '<button class="btn primary small" data-c="go">Vai alla stazione</button>' : ''}<button class="btn small" data-c="ok">Ho capito</button></div>`;
      this.box.hidden = false;
      return;
    }
  }

  private closeTip() {
    this.tip = null;
    if (this.step < 0) this.box.hidden = true;
  }

  /** nuova partita: il tutorial parte solo la prima volta */
  onNewGame() {
    if (!this.done) this.start();
  }

  /** due stazioni vicine al centro, buone per la prima linea */
  private suggestPair(): number[] {
    const g = this.d.game;
    const sts = g.state.stations.filter((s) => !g.stationLocked(s.id));
    if (sts.length < 2) return [];
    const c = { x: this.d.cam.x, y: this.d.cam.y };
    const a = sts.reduce((p, s) => (Math.hypot(s.x - c.x, s.y - c.y) < Math.hypot(p.x - c.x, p.y - c.y) ? s : p));
    const b = sts.filter((s) => s !== a).reduce((p, s) => (Math.hypot(s.x - a.x, s.y - a.y) < Math.hypot(p.x - a.x, p.y - a.y) ? s : p));
    return [a.id, b.id];
  }

  /** disegna gli aiuti del passo corrente sopra la mappa (coordinate dello schermo) */
  draw(ctx: CanvasRenderingContext2D) {
    if (this.step < 0) return;
    const t = performance.now() / 1000;
    const ring = (x: number, y: number) => {
      const r = 20 + 6 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30, 136, 229, 0.85)';
      ctx.lineWidth = 4;
      ctx.stroke();
    };
    if (this.step === 0 && this.hint.length === 2) {
      const [a, b] = this.hint.map((id) => this.d.game.net.stationById.get(id)).filter(Boolean) as Station[];
      if (!a || !b) return;
      const pa = this.d.cam.toScreen(a);
      const pb = this.d.cam.toScreen(b);
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = 'rgba(30, 136, 229, 0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      ring(pa.x, pa.y);
      ring(pb.x, pb.y);
    }
    if (this.step === 3) {
      for (const h of lineHandles(this.d.game, this.d.cam)) {
        const p = this.d.cam.toScreen(h.p);
        ring(p.x, p.y);
      }
    }
  }
}
