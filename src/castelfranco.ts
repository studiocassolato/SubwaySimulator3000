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
  // centro storico: Piazza Giorgione a nord del castello, la stazione a sud
  S('Castello', 'leisure', 1900, 1700, 120),
  S('Piazza Giorgione', 'food', 1900, 1390, 130),
  S('Corso XXIX Aprile', 'food', 2180, 1440, 110),
  S('Borgo Treviso', 'residential', 2350, 1720, 280),
  S('Borgo Vicenza', 'residential', 1480, 1700, 240),
  S('Borgo Padova', 'residential', 1880, 2450, 260),
  S('Stazione', 'offices', 2060, 2200, 130),
  S('Centro Direzionale', 'offices', 2480, 2100, 150),
  S('Villa Revedin', 'leisure', 2440, 1280, 160),
  S('Liceo Giorgione', 'school', 1580, 1180, 100),
  S('Istituti Tecnici', 'school', 2640, 1640, 100),
  S('Ospedale', 'hospital', 1460, 2200, 70),
  S('Giardini del Sole', 'food', 2740, 2320, 140),
  S('Stadio', 'leisure', 1600, 2600, 110),
  S('Piscine', 'leisure', 2050, 1050, 110),
  // zone produttive
  S('Zona Industriale', 'industrial', 2900, 2850, 330),
  S('Zona Artigianale', 'industrial', 860, 2900, 260),
  // frazioni
  S('Salvarosa', 'residential', 2700, 700, 300),
  S('Villarazzo', 'residential', 3150, 1250, 300),
  S('Salvatronda', 'residential', 3150, 2100, 300),
  S('Campigo', 'residential', 2450, 3250, 300),
  S('Treville', 'residential', 1000, 3250, 300),
  S("Sant'Andrea", 'residential', 640, 1760, 320),
  S('San Floriano', 'residential', 1300, 650, 280),
  S('Bella Venezia', 'residential', 1950, 600, 260),
  // paesi vicini (direzioni reali: Riese a nord, Godego a nord-ovest, Vedelago a est, Resana a sud)
  S('Riese Pio X', 'residential', 1750, 130, 260),
  S('Castello di Godego', 'residential', 520, 260, 260),
  S('Vedelago', 'residential', 3420, 1650, 260),
  S('Resana', 'residential', 2050, 3450, 280),
];

export const CASTELFRANCO: MapDef = {
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
    { name: 'SALVAROSA E SAN FLORIANO', label: { x: 2500, y: 380 }, poly: rect(0, -100, W + 100, 1050) },
    { name: 'CAMPIGO E TREVILLE', label: { x: 2900, y: 3450 }, poly: rect(0, 2550, W + 100, H + 100) },
    { name: 'VILLARAZZO', label: { x: 3200, y: 1850 }, poly: rect(2800, 1050, W + 100, 2550) },
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
  parks: [rect(2320, 1160, 2580, 1400)],
  walls: square(MOAT_IN - 8),
  rails: [
    // Vicenza – Treviso, che passa a sud del centro
    P([[-100, 2120], [700, 2140], [1300, 2170], [1800, 2200], [2060, 2250], [2600, 2320], [3200, 2380], [W + 100, 2400]]),
    // verso Bassano
    P([[2060, 2250], [1700, 2080], [1450, 1700], [1300, 1100], [1050, 400], [850, -100]]),
    // verso Padova
    P([[2060, 2250], [2000, 2700], [1900, 3200], [1820, H + 100]]),
  ],
  seeds: SEEDS,
  cores: P([[1900, 1800], [2060, 2200]]),
  denseArea: 'CASTELLO',
  focus: { x: 1950, y: 1900 },
  focusSize: { w: 1600, h: 1900 },
  welcome: 'Benvenuto a Castelfranco Veneto! Il sindaco ha approvato le prime stazioni attorno al castello: collegale con le linee.',
};

