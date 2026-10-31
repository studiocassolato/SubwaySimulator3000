import './style.css';
import { Camera } from './camera';
import {
  BUYBACK_FROM, COMPENSATION_BELOW, COMPENSATION_PER_POINT, COST, DONATION_REP, GRANT_PER_REP, LEVELS, MIN_REP_FOR_STATIONS, SEIZE_BELOW, OVERCROWD_LIMIT, ZONES, ZONE_TYPES, costMult, fareShare,
} from './config';
import { Input } from './input';
import { Music, type MusicStyle } from './music';
import { landAt, WORLD_H, WORLD_W } from './nyc';
import { render, type Selection } from './render';
import { GOALS, Game } from './sim';
import * as storage from './storage';
import type { Difficulty, GameState } from './types';
import { newGame } from './world';

/** minuti di gioco per secondo reale a velocità 1 (un giorno ≈ 16 minuti) */
const MINUTES_PER_SECOND = 1.5;
const AUTOSAVE_MS = 45_000;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvas = $<HTMLCanvasElement>('#map');
const ctx = canvas.getContext('2d')!;
const cam = new Camera();
const game = new Game(newGame());
const input = new Input(canvas, cam, game);
const music = new Music();
let tab: 'info' | 'lines' | 'goals' | 'log' = 'info';
let started = false;
let confirmNew = false;

// ---------- impostazioni locali (solo comodità per questo browser) ----------
const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('ss3000-prefs') ?? '{}') as { volume?: number; style?: MusicStyle; music?: boolean };
  } catch {
    return {};
  }
})();
function savePrefs() {
  try {
    localStorage.setItem('ss3000-prefs', JSON.stringify({ volume: music.volume, style: music.style, music: music.playing }));
  } catch {
    /* storage non disponibile: pazienza */
  }
}
music.setVolume(prefs.volume ?? 0.5);
music.setStyle(prefs.style ?? 'jazz');

// ---------- canvas ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  cam.w = canvas.clientWidth;
  cam.h = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function focusManhattan() {
  cam.x = 1650;
  cam.y = 2500;
  cam.zoom = Math.max(0.12, Math.min(0.3, Math.min(cam.w / 1800, cam.h / 2400)));
}
focusManhattan();

// ---------- ciclo principale ----------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (started && game.speed > 0) {
    let minutes = dt * MINUTES_PER_SECOND * game.speed;
    while (minutes > 0) {
      const step = Math.min(0.5, minutes);
      game.tick(step);
      minutes -= step;
    }
  }
  const dpr = canvas.width / cam.w;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(ctx, game, cam, {
    selection: input.selection, drag: input.drag, hoverStation: input.hoverStation,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- barra superiore ----------
const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('it-IT')}`;
function clock(t: number) {
  const day = Math.floor(t / 1440) + 1;
  const h = Math.floor((t % 1440) / 60);
  const m = Math.floor(t % 60);
  const icon = h >= 21 || h < 6 ? '🌙' : h < 10 ? '🌅' : h < 17 ? '☀️' : '🌇';
  return `${icon} <small class="hide-sm">Giorno</small><small class="show-sm">G</small> ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updateTopbar() {
  const s = game.state;
  $('#clock').innerHTML = clock(s.time);
  const money = $('#money');
  money.textContent = fmtMoney(s.money);
  money.classList.toggle('neg', s.money < 0);
  const pop = game.servedPopulation();
  const next = LEVELS[s.level];
  const cur = LEVELS[s.level - 1];
  const pct = next ? Math.min(100, ((pop - cur.population) / (next.population - cur.population)) * 100) : 100;
  $('#level').innerHTML = `Liv. ${s.level}<span class="bar"><i style="width:${Math.max(0, pct)}%"></i></span>`;
  $('#satisfaction').innerHTML = `😊 ${Math.round(s.satisfaction)}%`;
  $('#reputation').innerHTML = `🏛️ ${Math.round(s.reputation)}`;
  updateRequests();
  document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.speed) === game.speed);
  });
  $('#btn-music').classList.toggle('off', !music.playing);
}

document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) =>
  b.addEventListener('click', () => {
    game.speed = Number(b.dataset.speed);
    updateTopbar();
  }),
);
$('#btn-music').addEventListener('click', () => {
  music.toggle();
  savePrefs();
  updateTopbar();
});
$('#btn-menu').addEventListener('click', () => openMenu());

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, dialog')) return;
  if (e.code === 'Space') game.speed = game.speed ? 0 : 1;
  else if (e.key === '1') game.speed = 1;
  else if (e.key === '2') game.speed = 3;
  else if (e.key === '3') game.speed = 8;
  else if (e.key === 'Escape') input.select(null);
  else return;
  e.preventDefault();
  updateTopbar();
});

// ---------- richieste del sindaco, sempre in vista ----------
function hoursLeft(deadline: number) {
  const m = Math.max(0, deadline - game.state.time);
  return m >= 1440 ? `${Math.floor(m / 1440)}g ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, '0')}m`;
}
let lastReq = '';
function updateRequests() {
  const html = game.state.requests.map((r) => {
    const late = r.deadline - game.state.time < 360;
    const pct = Math.min(100, (r.progress / r.target) * 100);
    return `<div class="req ${late ? 'late' : ''}" data-req="${r.id}"><span class="time">⏱ ${hoursLeft(r.deadline)}</span>
      <b>🏛️ ${r.title}</b><span class="muted">Premio $${r.reward} · fiducia +${r.rep}${r.kind === 'deliver' ? ` · ${r.progress}/${r.target}` : ''}</span>
      ${r.kind === 'deliver' ? `<div class="meter"><i style="width:${pct}%"></i></div>` : ''}</div>`;
  }).join('');
  if (html === lastReq) return;
  lastReq = html;
  $('#requests').innerHTML = html;
}
$('#requests').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-req]');
  const r = el && game.state.requests.find((x) => x.id === Number(el.dataset.req));
  const st = r?.stationId !== undefined ? game.net.stationById.get(r.stationId) : undefined;
  if (st) {
    cam.x = st.x;
    cam.y = st.y;
    input.select({ kind: 'station', id: st.id });
  } else {
    tab = 'goals';
    setSheet(true);
    renderPanel(true);
  }
});

// ---------- notifiche ----------
function toast(text: string, kind: 'info' | 'good' | 'bad' = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  const box = $('#toasts');
  box.prepend(el);
  while (box.children.length > 4) box.lastChild!.remove();
  setTimeout(() => el.remove(), 4500);
}
game.onNotify = toast;
input.onQuote = (text) => {
  const q = $('#quote');
  q.hidden = !text;
  if (text) q.textContent = text;
};
input.onSelect = (s: Selection) => {
  if (s) {
    tab = 'info';
    setSheet(true);
  }
  renderPanel(true);
};
game.onChange = () => renderPanel();
// avviso bloccante: il gioco si ferma finché non si preme OK, poi riparte a velocità 1
game.onAlert = (title, html) => {
  game.speed = 0;
  $('#alert-title').textContent = title;
  $('#alert-body').innerHTML = html;
  const dlg = $<HTMLDialogElement>('#alert');
  if (!dlg.open) dlg.showModal();
  updateTopbar();
};
$('#alert-ok').addEventListener('click', () => $<HTMLDialogElement>('#alert').close());
$<HTMLDialogElement>('#alert').addEventListener('close', () => {
  game.speed = 1;
  updateTopbar();
});

// ---------- pannello laterale / foglio dal basso ----------
const panel = $('#panel');
function setSheet(open: boolean) {
  panel.classList.toggle('collapsed', !open);
  document.body.classList.toggle('sheet-closed', !open);
}
$('#sheet-handle').addEventListener('click', () => setSheet(panel.classList.contains('collapsed')));
if (window.matchMedia('(max-width: 760px)').matches) setSheet(false);

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab as typeof tab;
    setSheet(true);
    renderPanel(true);
  }),
);

let lastPanel = '';
function renderPanel(force = false) {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const html = tab === 'info' ? infoHtml() : tab === 'lines' ? linesHtml() : tab === 'goals' ? goalsHtml() : logHtml();
  if (!force && html === lastPanel) return;
  lastPanel = html;
  $('#panel-body').innerHTML = html;
}

const zoneChip = (t: keyof typeof ZONES, extra = '') =>
  `<span class="chip"><span class="dot" style="background:${ZONES[t].color}"></span>${ZONES[t].icon} ${ZONES[t].label}${extra}</span>`;

function infoHtml(): string {
  const sel = input.selection;
  const s = game.state;
  if (sel?.kind === 'station') {
    const st = game.net.stationById.get(sel.id);
    if (!st) return helpHtml();
    const serves = [...(game.net.serves.get(st.id) ?? [])];
    const lines = game.net.linesAt.get(st.id) ?? [];
    const unmet = [...(game.unmet.get(st.id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const closed = s.events.some((e) => e.kind === 'works' && e.stationId === st.id);
    const linked = lines.length > 0;
    const frozen = st.frozenUntil && s.time < st.frozenUntil;
    const urgency = !linked
      ? `<div class="hint">📣 <b>Malcontento ${Math.round(st.discontent)}%</b><br>I residenti aspettano la metro. Al 100% protestano e la fiducia del sindaco cala.</div>`
      : st.crowd > 0
        ? `<div class="hint">🚨 <b>Sovraffollamento ${Math.round((st.crowd / OVERCROWD_LIMIT) * 100)}%</b><br>Troppa gente in attesa: aggiungi treni o un'altra linea prima che scatti la crisi.</div>`
        : '';
    return `
      <h3>Ⓜ ${st.name}</h3>
      <p class="muted">${landAt(st)?.name ?? ''}${closed ? ' · 🚧 chiusa per lavori' : ''}</p>
      <p><b>${st.waiting.length}</b> passeggeri in attesa${frozen ? ' · 🧊 crescita ferma dopo una crisi' : ''}</p>
      ${urgency}
      <h4>Zone servite a piedi</h4>
      <div>${serves.length ? serves.map((t) => zoneChip(t)).join('') : '<span class="muted">Nessuna zona edificata vicina</span>'}</div>
      <h4>Linee</h4>
      ${lines.length ? lines.map((l) => `<div class="row"><span class="swatch" style="background:${l.color}"></span><span class="grow">${l.name}</span><button class="btn small" data-action="select-line" data-id="${l.id}">Apri</button></div>`).join('') : '<p class="muted">Nessuna linea. Trascina da questa stazione a un\'altra per crearne una.</p>'}
      ${unmet.length ? `<div class="hint"><b>Domanda non servita</b><br>Persone che vorrebbero partire da qui ma non hanno un percorso:<br>${unmet.slice(0, 5).map(([t, n]) => zoneChip(t, ` · ${n}`)).join('')}</div>` : ''}
`;
  }
  if (sel?.kind === 'line') {
    const line = s.lines.find((l) => l.id === sel.id);
    if (!line) return helpHtml();
    const trains = s.trains.filter((t) => t.lineId === line.id);
    const aboard = trains.reduce((a, t) => a + t.passengers.length, 0);
    const tunnels = game.net.geom.get(line.id)?.tunnels.length ?? 0;
    if (line.seized) {
      const canBuy = s.reputation >= BUYBACK_FROM;
      return `
      <h3>🏛️ ${line.name}</h3>
      <div class="hint"><b>In gestione al Comune.</b> I treni girano ma non portano i tuoi passeggeri, e non puoi collegarti alle sue stazioni.</div>
      <p>${line.stations.map((id) => game.net.stationById.get(id)!.name).join(' · ')}</p>
      <div class="btns"><button class="btn primary" data-action="buyback" data-id="${line.id}" ${canBuy ? '' : 'disabled'}>🔑 Riscatta per ${fmtMoney(game.buybackCost(line))}</button></div>
      ${canBuy ? '' : `<p class="muted">Il sindaco tratta solo con fiducia almeno ${BUYBACK_FROM} (ora ${Math.round(s.reputation)}).</p>`}`;
    }
    return `
      <h3><span class="swatch" style="display:inline-block;background:${line.color}"></span> ${line.name}</h3>
      <p class="muted">${line.stations.length} fermate · ${tunnels} gallerie · ${aboard} passeggeri a bordo</p>
      <div class="row"><span class="grow">🚆 Treni: <b>${trains.length}</b> <span class="muted">(${game.levelInfo.trainCapacity} posti)</span></span>
        <button class="btn small" data-action="train-remove" data-id="${line.id}">−</button>
        <button class="btn small" data-action="train-add" data-id="${line.id}">+ ${fmtMoney(game.trainCost)}</button></div>
      <h4>Fermate</h4>
      ${line.stations.map((id) => {
        const st = game.net.stationById.get(id)!;
        return `<div class="row"><span class="grow">${st.name} <span class="muted">· ${st.waiting.length} in attesa</span></span><button class="btn small" title="Togli dalla linea" data-action="unlink" data-line="${line.id}" data-id="${id}">✕</button></div>`;
      }).join('')}
      <p class="muted">Per prolungare trascina la "T" a un capolinea. Per aggiungere una fermata in mezzo, trascina un tratto della linea selezionata su una stazione.</p>
      <div class="btns"><button class="btn danger" data-action="delete-line" data-id="${line.id}">Chiudi la linea</button></div>`;
  }
  if (sel?.kind === 'cell') {
    const c = s.cells.find((x) => x.id === sel.id);
    if (!c) return helpHtml();
    const z = ZONES[c.type];
    const station = [...game.net.catchment.entries()].find(([, ids]) => ids.includes(c.id));
    const st = station && game.net.stationById.get(station[0]);
    return `
      <h3>${z.icon} ${z.label}</h3>
      <p class="muted">${landAt({ x: c.x + c.w / 2, y: c.y + c.h / 2 })?.name ?? ''}</p>
      <p>Densità: <b>${c.density ? '▮'.repeat(c.density) + '▯'.repeat(5 - c.density) : 'terreno libero'}</b></p>
      <p>${st ? `Servito dalla stazione <b>${st.name}</b>.` : 'Nessuna stazione entro il raggio pedonale.'}</p>
      <p class="muted">Gli isolati vicini a stazioni ben servite crescono di densità, e i terreni liberi vengono edificati.</p>`;
  }
  return helpHtml();
}

function helpHtml(): string {
  const st = game.state.stats;
  return `
    <h3>Come si gioca</h3>
    <p>1. Le stazioni le decide il <b>sindaco</b>: ne trovi già alcune e ogni mattina ne approva una nuova.</p>
    <p>2. Tu costruisci le <b>linee</b>: trascina da una stazione all'altra, passando sopra più stazioni le colleghi in fila. I soldi non bastano per tutte: scegli bene.</p>
    <p>3. I passeggeri (pallini colorati) vanno verso il tipo di zona del loro colore. Ogni viaggio completato è un incasso.</p>
    <p>4. Le zone servite bene crescono. Più abitanti servi, più sali di livello e sblocchi linee e treni più capienti.</p>
    <p>5. <b>Attenzione:</b> le stazioni scollegate accumulano malcontento, quelle sovraffollate rischiano la crisi, e il sindaco fa richieste a tempo. La sua fiducia (🏛️) decide quanto incassi dai biglietti, quanto costa costruire, il contributo del Comune e se apre nuove stazioni.</p>
    <p class="muted">Attraversare fiumi e baie richiede una galleria (${fmtMoney(COST.tunnel)}). Trascina per spostare la mappa, pizzica o usa la rotella per lo zoom.</p>
    <h4>Zone</h4>
    <div class="legend">${ZONE_TYPES.map((t) => `<div><span class="dot" style="background:${ZONES[t].color}"></span> ${ZONES[t].icon} ${ZONES[t].label}</div>`).join('')}</div>
    <h4>Oggi</h4>
    <p>Incassi ${fmtMoney(st.incomeToday)} · Spese ${fmtMoney(st.expensesToday)}<br>
    Passeggeri trasportati: <b>${st.delivered.toLocaleString('it-IT')}</b> · persi: ${st.lost}<br>
    Abitanti serviti: <b>${game.servedPopulation().toLocaleString('it-IT')}</b></p>`;
}

function trustHtml(): string {
  const r = game.state.reputation;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return `<h4>Fiducia del sindaco: ${Math.round(r)}/100</h4>
    <div class="row"><span class="grow">🎟️ Quota dei biglietti che tieni</span><b>${pct(fareShare(r))}</b></div>
    <div class="row"><span class="grow">🏗️ Costi di costruzione</span><b>${pct(costMult(r))}</b></div>
    <div class="row"><span class="grow">💵 ${r >= COMPENSATION_BELOW ? 'Contributo giornaliero' : 'Compensazione che paghi ogni giorno'}</span><b>${fmtMoney(r >= COMPENSATION_BELOW ? r * GRANT_PER_REP : (COMPENSATION_BELOW - r) * COMPENSATION_PER_POINT * game.state.level)}</b></div>
    <div class="row"><span class="grow">🚇 Nuove stazioni ogni mattina</span><b>${r >= MIN_REP_FOR_STATIONS ? 'sì' : `no (serve ${MIN_REP_FOR_STATIONS})`}</b></div>
    <div class="row"><span class="grow">🏛️ Linee a rischio</span><b>${r < SEIZE_BELOW ? 'il sindaco ne prende una stanotte' : `sotto ${SEIZE_BELOW}`}</b></div>
    <div class="btns"><button class="btn" data-action="donate" ${r >= 100 ? 'disabled' : ''}>🤝 Dona ${fmtMoney(game.donationCost())} al Comune (+${DONATION_REP} fiducia)</button></div>
    <p class="muted">La fiducia sale ogni giorno se colleghi più della metà delle stazioni e i passeggeri sono soddisfatti, con le richieste completate e con le donazioni (sempre più care nello stesso giorno). Scende con proteste, crisi e richieste scadute. Sotto ${COMPENSATION_BELOW} paghi tu una compensazione al Comune, sotto ${SEIZE_BELOW} il sindaco si prende la linea peggiore: la riscatti da ${BUYBACK_FROM} in su.</p>`;
}

function linesHtml(): string {
  const s = game.state;
  const rows = s.lines.map((l) => {
    const trains = s.trains.filter((t) => t.lineId === l.id).length;
    return `<div class="row"><span class="swatch" style="background:${l.color}"></span><span class="grow">${l.seized ? '🏛️ ' : ''}${l.name}<br><small class="muted">${l.seized ? 'gestita dal Comune · ' : ''}${l.stations.length} fermate · ${trains} treni</small></span>
      <button class="btn small" data-action="train-remove" data-id="${l.id}">−</button>
      <button class="btn small" data-action="train-add" data-id="${l.id}">+🚆</button>
      <button class="btn small" data-action="select-line" data-id="${l.id}">Apri</button></div>`;
  });
  return `<h3>Linee ${s.lines.length}/${game.levelInfo.maxLines}</h3>
    ${rows.length ? rows.join('') : '<p class="muted">Nessuna linea ancora. Trascina da una stazione all\'altra per aprirne una.</p>'}
    <p class="muted">Manutenzione giornaliera: ${fmtMoney(COST.trainUpkeepPerDay)} per treno, ${fmtMoney(COST.stationUpkeepPerDay)} per stazione.</p>`;
}

function goalsHtml(): string {
  const s = game.state;
  const pop = game.servedPopulation();
  const next = LEVELS[s.level];
  return `<h3>Livello ${s.level}</h3>
    <p>Abitanti serviti: <b>${pop.toLocaleString('it-IT')}</b>${next ? ` / ${next.population.toLocaleString('it-IT')} per il livello ${s.level + 1}` : ''}</p>
    ${next ? `<p class="muted">Prossimo: ${next.unlock}</p>` : '<p class="muted">Livello massimo del prototipo raggiunto!</p>'}
    <h4>Richieste del sindaco</h4>
    ${s.requests.length ? s.requests.map((r) => `<div class="row"><span>🏛️</span><span class="grow">${r.title}<br><small class="muted">⏱ ${hoursLeft(r.deadline)} · ${r.kind === 'deliver' ? `${r.progress}/${r.target} · ` : ''}+${fmtMoney(r.reward)}</small></span></div>`).join('') : '<p class="muted">Nessuna richiesta al momento.</p>'}
    ${trustHtml()}
    <h4>Obiettivi</h4>
    ${GOALS.map((g) => {
      const done = s.goalsDone.includes(g.id);
      return `<div class="row goal ${done ? 'done' : ''}"><span>${done ? '✅' : '⬜'}</span><span class="grow">${g.text}</span><span class="muted">+${fmtMoney(g.reward)}</span></div>`;
    }).join('')}`;
}

function logHtml(): string {
  const s = game.state;
  const ev = s.events.map((e) => `<div class="hint">⚠️ ${e.title}</div>`).join('');
  return `<h3>Notizie</h3>${ev}${s.log.map((l) => `<div class="log-item"><time>${clock(l.t).replace(/^\S+ /, '')}</time>${l.text}</div>`).join('')}`;
}

$('#panel-body').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!b) return;
  const id = Number(b.dataset.id);
  switch (b.dataset.action) {
    case 'select-line': input.select({ kind: 'line', id }); break;
    case 'train-add': game.addTrain(id); break;
    case 'train-remove': game.removeTrain(id); break;
    case 'unlink': game.removeStationFromLine(Number(b.dataset.line), id); break;
    case 'delete-line': game.deleteLine(id); input.select(null); break;
    case 'buyback': game.buyback(id); break;
    case 'donate': game.donate(); break;
  }
  renderPanel(true);
});

setInterval(() => {
  updateTopbar();
  renderPanel();
}, 250);

// ---------- salvataggi ----------
async function autosave() {
  if (!started) return;
  try {
    await storage.save('auto', game.state);
  } catch (err) {
    console.warn('Salvataggio automatico non riuscito', err);
  }
}
setInterval(autosave, AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void autosave();
});
window.addEventListener('pagehide', () => void autosave());

function startWith(state: GameState) {
  game.load(state);
  input.select(null);
  started = true;
  game.speed = 1;
  // avviata da un clic, quindi il browser permette l'audio
  if (prefs.music !== false && !music.playing) music.start();
  focusManhattan();
  $<HTMLDialogElement>('#menu').close();
  renderPanel(true);
  updateTopbar();
  void autosave();
}

const SLOT_LABEL: Record<storage.SlotId, string> = { auto: 'Automatico', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

async function openMenu() {
  const prevSpeed = game.speed;
  if (started) game.speed = 0;
  let saves: storage.SaveRecord[] = [];
  try {
    saves = await storage.list();
  } catch {
    toast('Salvataggi non disponibili in questo browser', 'bad');
  }
  const bySlot = new Map(saves.map((s) => [s.slot, s]));
  const fmtDate = (t: number) => new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  $('#menu-body').innerHTML = `
    <h2>Subway<b>Simulator3000</b></h2>
    <p class="muted">Costruisci la metropolitana di New York, un pezzo alla volta.</p>
    <div class="btns">
      ${started ? '<button class="btn primary" data-m="resume">▶ Riprendi</button>' : bySlot.has('auto') ? '<button class="btn primary" data-m="load" data-slot="auto">▶ Continua</button>' : ''}
      <button class="btn ${!started && !bySlot.has('auto') ? 'primary' : ''}" data-m="new">${confirmNew ? 'Sicuro? Tocca di nuovo' : '✨ Nuova partita'}</button>
    </div>
    <h4>Salvataggi</h4>
    ${storage.SLOTS.map((slot) => {
      const rec = bySlot.get(slot);
      return `<div class="slot"><div class="grow"><b>${SLOT_LABEL[slot]}</b><small>${rec ? `${rec.summary} · ${fmtDate(rec.savedAt)}` : 'vuoto'}</small></div>
        ${started && slot !== 'auto' ? `<button class="btn small" data-m="save" data-slot="${slot}">Salva</button>` : ''}
        ${rec ? `<button class="btn small" data-m="load" data-slot="${slot}">Carica</button>` : ''}</div>`;
    }).join('')}
    <div class="btns">
      ${started ? '<button class="btn" data-m="export">⬇ Esporta file</button>' : ''}
      <button class="btn" data-m="import">⬆ Importa file</button>
    </div>
    <h4>Impostazioni</h4>
    <label class="field">Imprevisti
      <select data-m="difficulty">
        ${(['off', 'easy', 'normal'] as Difficulty[]).map((d) => `<option value="${d}" ${game.state.difficulty === d ? 'selected' : ''}>${{ off: 'Disattivati', easy: 'Pochi', normal: 'Normali' }[d]}</option>`).join('')}
      </select></label>
    <label class="field">Musica
      <select data-m="style">
        <option value="jazz" ${music.style === 'jazz' ? 'selected' : ''}>Jazz di città</option>
        <option value="vlog" ${music.style === 'vlog' ? 'selected' : ''}>Chill hop da vlog</option>
      </select>
      <button class="btn small" data-m="music">${music.playing ? '⏸ Ferma' : '▶ Suona'}</button></label>
    <label class="field">Volume <input type="range" min="0" max="1" step="0.05" value="${music.volume}" data-m="volume"></label>
    <p class="muted" style="font-size:12px">Mappa di New York stilizzata, disegnata a mano. Musica generata dal vivo nel browser, senza brani protetti da copyright. Salvataggi nel browser (IndexedDB): usa "Esporta file" per una copia di sicurezza o per spostarti su un altro dispositivo.</p>`;
  const dlg = $<HTMLDialogElement>('#menu');
  if (!dlg.open) dlg.showModal();
  dlg.onclose = () => {
    if (started && game.speed === 0) game.speed = prevSpeed || 1;
    confirmNew = false;
  };
}

$('#menu-body').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-m]');
  if (!b) return;
  const slot = b.dataset.slot as storage.SlotId;
  switch (b.dataset.m) {
    case 'resume': $<HTMLDialogElement>('#menu').close(); break;
    case 'new':
      if (started && !confirmNew) {
        confirmNew = true;
        return openMenu();
      }
      confirmNew = false;
      startWith(newGame());
      toast('Nuova partita: New York ti aspetta!', 'good');
      break;
    case 'save':
      await storage.save(slot, game.state);
      toast(`Salvato in ${SLOT_LABEL[slot]}`, 'good');
      void openMenu();
      break;
    case 'load': {
      const rec = await storage.load(slot);
      if (rec) {
        startWith(rec.state);
        toast(`Caricato: ${rec.summary}`, 'good');
      }
      break;
    }
    case 'export': storage.exportFile(game.state); break;
    case 'import': $<HTMLInputElement>('#import-file').click(); break;
    case 'music':
      music.toggle();
      savePrefs();
      void openMenu();
      break;
  }
});
$('#menu-body').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.m === 'difficulty') game.state.difficulty = el.value as Difficulty;
  if (el.dataset.m === 'style') music.setStyle(el.value as MusicStyle);
  savePrefs();
});
$('#menu-body').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.m === 'volume') {
    music.setVolume(Number(el.value));
    savePrefs();
  }
});
$<HTMLInputElement>('#import-file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    startWith(await storage.importFile(file));
    toast('Partita importata', 'good');
  } catch (err) {
    toast((err as Error).message, 'bad');
  }
  (e.target as HTMLInputElement).value = '';
});
// per i test automatici e il debug dalla console
(window as unknown as { ss3000: unknown }).ss3000 = { game, cam, input, startWith, newGame, WORLD_W, WORLD_H };

renderPanel(true);
updateTopbar();
void openMenu();
