import './style.css';
import { Camera } from './camera';
import { COST, LEVELS, ZONES, ZONE_TYPES } from './config';
import { Input, type Tool } from './input';
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
    placing: input.tool === 'station' ? input.placing : null, tool: input.tool,
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

document.querySelectorAll<HTMLButtonElement>('.tools button').forEach((b) =>
  b.addEventListener('click', () => setTool(b.dataset.tool as Tool)),
);
function setTool(t: Tool) {
  input.setTool(t);
  document.querySelectorAll<HTMLButtonElement>('.tools button').forEach((x) => x.classList.toggle('active', x.dataset.tool === t));
  if (t === 'station') toast(`Tocca la mappa per costruire una stazione (${fmtMoney(COST.station)})`);
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, dialog')) return;
  if (e.code === 'Space') game.speed = game.speed ? 0 : 1;
  else if (e.key === '1') game.speed = 1;
  else if (e.key === '2') game.speed = 3;
  else if (e.key === '3') game.speed = 8;
  else if (e.key === 'l') setTool('line');
  else if (e.key === 's') setTool('station');
  else if (e.key === 'd') setTool('demolish');
  else if (e.key === 'Escape') input.select(null);
  else return;
  e.preventDefault();
  updateTopbar();
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
    // mentre si costruiscono stazioni il foglio resta chiuso per non coprire la mappa
    if (input.tool !== 'station') setSheet(true);
  }
  renderPanel(true);
};
game.onChange = () => renderPanel();

// ---------- pannello laterale / foglio dal basso ----------
const panel = $('#panel');
const tools = $('.tools');
function setSheet(open: boolean) {
  panel.classList.toggle('collapsed', !open);
  tools.classList.toggle('low', !open);
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
    return `
      <h3>Ⓜ ${st.name}</h3>
      <p class="muted">${landAt(st)?.name ?? ''}${closed ? ' · 🚧 chiusa per lavori' : ''}</p>
      <p><b>${st.waiting.length}</b> passeggeri in attesa</p>
      <h4>Zone servite a piedi</h4>
      <div>${serves.length ? serves.map((t) => zoneChip(t)).join('') : '<span class="muted">Nessuna zona edificata vicina</span>'}</div>
      <h4>Linee</h4>
      ${lines.length ? lines.map((l) => `<div class="row"><span class="swatch" style="background:${l.color}"></span><span class="grow">${l.name}</span><button class="btn small" data-action="select-line" data-id="${l.id}">Apri</button></div>`).join('') : '<p class="muted">Nessuna linea. Trascina da questa stazione a un\'altra per crearne una.</p>'}
      ${unmet.length ? `<div class="hint"><b>Domanda non servita</b><br>Persone che vorrebbero partire da qui ma non hanno un percorso:<br>${unmet.slice(0, 5).map(([t, n]) => zoneChip(t, ` · ${n}`)).join('')}</div>` : ''}
      <div class="btns"><button class="btn danger" data-action="remove-station" data-id="${st.id}">Demolisci (+${fmtMoney(COST.station / 2)})</button></div>`;
  }
  if (sel?.kind === 'line') {
    const line = s.lines.find((l) => l.id === sel.id);
    if (!line) return helpHtml();
    const trains = s.trains.filter((t) => t.lineId === line.id);
    const aboard = trains.reduce((a, t) => a + t.passengers.length, 0);
    const tunnels = game.net.geom.get(line.id)?.tunnels.length ?? 0;
    return `
      <h3><span class="swatch" style="display:inline-block;background:${line.color}"></span> ${line.name}</h3>
      <p class="muted">${line.stations.length} fermate · ${tunnels} gallerie · ${aboard} passeggeri a bordo</p>
      <div class="row"><span class="grow">🚆 Treni: <b>${trains.length}</b> <span class="muted">(${game.levelInfo.trainCapacity} posti)</span></span>
        <button class="btn small" data-action="train-remove" data-id="${line.id}">−</button>
        <button class="btn small" data-action="train-add" data-id="${line.id}">+ ${fmtMoney(COST.train)}</button></div>
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
    <p>1. Scegli <b>Stazione</b> e tocca la mappa per costruirne una (${fmtMoney(COST.station)}).</p>
    <p>2. Con <b>Linee</b> trascina da una stazione all'altra: passando sopra più stazioni le colleghi in fila.</p>
    <p>3. I passeggeri (pallini colorati) vanno verso il tipo di zona del loro colore. Ogni viaggio completato è un incasso.</p>
    <p>4. Le zone servite bene crescono. Più abitanti servi, più sali di livello e sblocchi linee e treni più capienti.</p>
    <p class="muted">Attraversare fiumi e baie richiede una galleria (${fmtMoney(COST.tunnel)}). Trascina per spostare la mappa, pizzica o usa la rotella per lo zoom.</p>
    <h4>Zone</h4>
    <div class="legend">${ZONE_TYPES.map((t) => `<div><span class="dot" style="background:${ZONES[t].color}"></span> ${ZONES[t].icon} ${ZONES[t].label}</div>`).join('')}</div>
    <h4>Oggi</h4>
    <p>Incassi ${fmtMoney(st.incomeToday)} · Spese ${fmtMoney(st.expensesToday)}<br>
    Passeggeri trasportati: <b>${st.delivered.toLocaleString('it-IT')}</b> · persi: ${st.lost}<br>
    Abitanti serviti: <b>${game.servedPopulation().toLocaleString('it-IT')}</b></p>`;
}

function linesHtml(): string {
  const s = game.state;
  const rows = s.lines.map((l) => {
    const trains = s.trains.filter((t) => t.lineId === l.id).length;
    return `<div class="row"><span class="swatch" style="background:${l.color}"></span><span class="grow">${l.name}<br><small class="muted">${l.stations.length} fermate · ${trains} treni</small></span>
      <button class="btn small" data-action="train-remove" data-id="${l.id}">−</button>
      <button class="btn small" data-action="train-add" data-id="${l.id}">+🚆</button>
      <button class="btn small" data-action="select-line" data-id="${l.id}">Apri</button></div>`;
  });
  return `<h3>Linee ${s.lines.length}/${game.levelInfo.maxLines}</h3>
    ${rows.length ? rows.join('') : '<p class="muted">Nessuna linea ancora. Costruisci due stazioni e trascina dall\'una all\'altra.</p>'}
    <p class="muted">Manutenzione giornaliera: ${fmtMoney(COST.trainUpkeepPerDay)} per treno, ${fmtMoney(COST.stationUpkeepPerDay)} per stazione.</p>`;
}

function goalsHtml(): string {
  const s = game.state;
  const pop = game.servedPopulation();
  const next = LEVELS[s.level];
  return `<h3>Livello ${s.level}</h3>
    <p>Abitanti serviti: <b>${pop.toLocaleString('it-IT')}</b>${next ? ` / ${next.population.toLocaleString('it-IT')} per il livello ${s.level + 1}` : ''}</p>
    ${next ? `<p class="muted">Prossimo: ${next.unlock}</p>` : '<p class="muted">Livello massimo del prototipo raggiunto!</p>'}
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
    case 'remove-station': game.removeStation(id); input.select(null); break;
    case 'train-add': game.addTrain(id); break;
    case 'train-remove': game.removeTrain(id); break;
    case 'unlink': game.removeStationFromLine(Number(b.dataset.line), id); break;
    case 'delete-line': game.deleteLine(id); input.select(null); break;
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
