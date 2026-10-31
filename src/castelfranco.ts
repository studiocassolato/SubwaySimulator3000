import type { MapDef, Seed } from './maps';
import type { Vec, ZoneType } from './types';

/**
 * Castelfranco Veneto stilizzata, disegnata a mano (non in scala).
 * Al centro il castello quadrato con il fossato, a ovest il Muson dei Sassi,
 * intorno i borghi e le frazioni. Coordinate di gioco: x verso est, y verso sud.
 */
const W = 3600;
const H = 3600;

const P = (pts: [number, number][]): Vec[] => pts.map(([x, y]) => ({ x, y }));
const rect = (x0: number, y0: number, x1: number, y1: number) => P([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/** centro del castello */
const C = { x: 1900, y: 1700 };
const MOAT_OUT = 235;
const MOAT_IN = 175;
const square = (h: number) => rect(C.x - h, C.y - h, C.x + h, C.y + h);

/** Muson dei Sassi: scende da nord a sud a ovest della città, con qualche ansa. */
const riverX = (y: number) => 1130 + 70 * Math.sin(y / 520) + 30 * Math.sin(y / 170 + 1);
const RIVER_HALF = 38;
const riverYs: number[] = [];
for (let y = -100; y <= H + 100; y += 100) riverYs.push(y);
const RIVER = [
  ...riverYs.map((y) => ({ x: riverX(y) - RIVER_HALF, y })),
  ...[...riverYs].reverse().map((y) => ({ x: riverX(y) + RIVER_HALF, y })),
];

const S = (name: string, type: ZoneType, x: number, y: number, r: number): Seed => ({ name, type, x, y, r });

const SEEDS: Seed[] = [
  // centro storico e borghi
  S('Castello', 'leisure', 1900, 1700, 120),
  S('Piazza Giorgione', 'food', 1900, 2010, 130),
  S('Corso XXIX Aprile', 'food', 2160, 1960, 110),
  S('Borgo Treviso', 'residential', 2330, 1700, 280),
  S('Borgo Vicenza', 'residential', 1480, 1700, 240),
  S('Borgo Padova', 'residential', 1880, 2450, 260),
  S('Stazione', 'offices', 2060, 2200, 130),
  S('Centro Direzionale', 'offices', 2480, 2060, 150),
  S('Villa Revedin', 'leisure', 1880, 1260, 160),
  S('Liceo Giorgione', 'school', 1540, 1320, 100),
  S('Istituti Tecnici', 'school', 2620, 1560, 100),
  S('Ospedale', 'hospital', 2380, 1300, 70),
  S('Giardini del Sole', 'food', 2720, 2280, 140),
  S('Stadio', 'leisure', 1460, 2260, 110),
  S('Piscine', 'leisure', 2700, 1140, 110),
  // zone produttive
  S('Zona Industriale', 'industrial', 2900, 2900, 330),
  S('Zona Artigianale', 'industrial', 860, 2900, 260),
  // frazioni e paesi vicini
  S('Salvatronda', 'residential', 3150, 1600, 320),
  S('Salvarosa', 'residential', 2330, 700, 300),
  S('Campigo', 'residential', 3000, 560, 300),
  S('San Floriano', 'residential', 1520, 520, 280),
  S('Treville', 'residential', 680, 760, 320),
  S("Sant'Andrea", 'residential', 640, 1760, 320),
  S('Bella Venezia', 'residential', 1400, 3000, 260),
  S('Villarazzo', 'residential', 2330, 3150, 300),
  S('Resana', 'residential', 3250, 3320, 300),
  S('Vedelago', 'residential', 3380, 1000, 260),
  S('Castello di Godego', 'residential', 520, 220, 260),
];

/**
 * Le coordinate qui sotto sono state disegnate con nord e sud scambiati:
 * flipNS le ribalta, tranne i paesi vicini già al posto giusto.
 */
const DRAWN: MapDef = {
  id: 'castelfranco',
  city: 'Castelfranco Veneto',
  icon: '🏰',
  blurb: 'Il castello col fossato, il Muson e le frazioni: una città piccola da far crescere.',
  width: W,
  height: H,
  // l'ordine conta: vince il primo distretto che contiene il punto
  land: [
    { name: 'CASTELLO', poly: square(MOAT_IN) },
    { name: 'OLTRE MUSON', label: { x: 560, y: 2350 }, poly: [{ x: -100, y: -100 }, ...riverYs.map((y) => ({ x: riverX(y), y })), { x: -100, y: H + 100 }] },
    { name: 'CASTELFRANCO', label: { x: 2050, y: 2780 }, poly: rect(0, 1050, 2800, 2550) },
    { name: 'CAMPIGO E SALVAROSA', label: { x: 2400, y: 330 }, poly: rect(0, -100, W + 100, 1050) },
    { name: 'VILLARAZZO', label: { x: 2500, y: 3450 }, poly: rect(0, 2550, W + 100, H + 100) },
    { name: 'SALVATRONDA', label: { x: 3250, y: 1950 }, poly: rect(2800, 1050, W + 100, 2550) },
  ],
  ground: rect(-100, -100, W + 100, H + 100),
  water: [
    { poly: RIVER },
    { poly: square(MOAT_OUT), holes: [square(MOAT_IN)] },
  ],
  waterLabels: [
    { name: 'Muson dei Sassi', at: { x: riverX(1150) + 2, y: 1150 }, angle: -1.5 },
    { name: 'Muson dei Sassi', at: { x: riverX(2700) + 2, y: 2700 }, angle: -1.5 },
  ],
  extraLabels: [],
  parks: [rect(1760, 1140, 2010, 1380)],
  walls: square(MOAT_IN - 8),
  rails: [
    // Vicenza – Treviso, che passa a nord del centro dopo il ribaltamento
    P([[-100, 2120], [700, 2140], [1300, 2170], [1800, 2200], [2060, 2250], [2600, 2320], [3200, 2380], [W + 100, 2400]]),
    // verso Padova (dopo il ribaltamento)
    P([[2060, 2250], [2350, 2050], [2700, 1600], [2950, 900], [3150, -100]]),
    // verso Bassano (dopo il ribaltamento)
    P([[2060, 2250], [2000, 2700], [1900, 3200], [1820, H + 100]]),
  ],
  seeds: SEEDS,
  cores: P([[1900, 1800], [2060, 2200]]),
  denseArea: 'CASTELLO',
  focus: { x: 1950, y: 1900 },
  focusSize: { w: 1600, h: 1900 },
  welcome: 'Benvenuto a Castelfranco Veneto! Il sindaco ha approvato le prime stazioni attorno al castello: collegale con le linee.',
};

/** paesi vicini disegnati già nella posizione giusta */
const KEEP = new Set(['Castello di Godego', 'Resana', 'Vedelago']);
/** Borgo Padova resta verso Padova, cioè a sud del castello */
const MOVE: Record<string, Vec> = { 'Borgo Padova': { x: 1880, y: 2650 } };

function flipNS(m: MapDef): MapDef {
  const f = (p: Vec): Vec => ({ x: p.x, y: m.height - p.y });
  const fp = (poly: Vec[]) => poly.map(f);
  return {
    ...m,
    land: m.land.map((l) => ({ ...l, poly: fp(l.poly), label: l.label && f(l.label) })),
    water: m.water.map((w) => ({ poly: fp(w.poly), holes: w.holes?.map(fp) })),
    waterLabels: m.waterLabels.map((w) => ({ ...w, at: f(w.at) })),
    extraLabels: m.extraLabels.map((l) => ({ ...l, at: f(l.at) })),
    parks: m.parks.map(fp),
    walls: m.walls && fp(m.walls),
    rails: m.rails?.map(fp),
    seeds: m.seeds.map((s) => (KEEP.has(s.name) ? s : MOVE[s.name] ? { ...s, ...MOVE[s.name] } : { ...s, y: m.height - s.y })),
    cores: fp(m.cores),
    focus: f(m.focus),
  };
}

export const CASTELFRANCO: MapDef = flipNS(DRAWN);
