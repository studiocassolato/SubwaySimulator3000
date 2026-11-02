import type { MapDef, Seed } from './maps';
import { dirPoint, labelAngle, nearestIndex, projector, rect, ring, riverPoly, seed, smooth, wedge, type LatLon } from './geo';
import type { ZoneType } from './types';
import { CASTELFRANCO_RAILS, MUSON } from './veneto';

/**
 * Riese Pio X: il paese natale di San Pio X con le frazioni Vallà, Spineda e Poggiana,
 * il santuario delle Cendrole e il Muson a ovest. Posizioni da OpenStreetMap,
 * proiettate "a lente" (vedi geo.ts): direzioni vere, centro ingrandito.
 */
const W = 3400;
const H = 3400;
const O = { x: 1700, y: 1700 };
const CENTER: LatLon = [45.72922, 11.917];
const pr = projector(CENTER, O, 540, 400);
const at = (lat: number, lon: number) => pr.pt([lat, lon]);
const C = at(...CENTER);

const RIVER = smooth(pr.pts(MUSON));

const S = (name: string, type: ZoneType, lat: number, lon: number, r: number): Seed => seed(name, type, at(lat, lon), r);

const SEEDS: Seed[] = [
  S('Piazza Pio X', 'food', ...CENTER, 140),
  S('Casa natale di San Pio X', 'leisure', 45.72847, 11.91357, 100),
  S('Parco di Villa Eger', 'leisure', 45.73096, 11.91643, 90),
  S('Campo sportivo', 'leisure', 45.7333, 11.91717, 100),
  S('Palazzon', 'residential', 45.73708, 11.92131, 220),
  S('Casoni di Riese', 'residential', 45.71134, 11.93894, 220),
  S('Santuario delle Cendrole', 'leisure', 45.73463, 11.89579, 120),
  S('Zona Industriale Est', 'industrial', 45.7162, 11.9448, 260),
  S('Zona Artigianale Nord', 'industrial', 45.7464, 11.9083, 220),
  // frazioni
  S('Vallà', 'residential', 45.70599, 11.93097, 280),
  S('Poggiana', 'residential', 45.71886, 11.88191, 260),
  S('Spineda', 'residential', 45.75094, 11.8789, 260),
  S('Costanza', 'residential', 45.74636, 11.89074, 200),
  // paesi vicini
  S('San Vito e Tomba Brion', 'leisure', 45.75516, 11.91141, 200),
  S('Altivole', 'residential', 45.754, 11.95536, 240),
  S('Caselle di Altivole', 'residential', 45.7427, 11.97269, 200),
  S('Lauro', 'residential', 45.76299, 11.89113, 200),
  S('Loria', 'residential', 45.72842, 11.86558, 240),
  S('Ramon', 'residential', 45.71319, 11.86536, 200),
  S('Castello di Godego', 'residential', 45.69238, 11.88104, 240),
  S('Istituto Agrario', 'school', 45.69174, 11.94681, 120),
  S('Fanzolo e Villa Emo', 'leisure', 45.71169, 11.99128, 200),
  S('Castelfranco Veneto', 'hospital', 45.67637, 11.93089, 120),
];

const musonAt = (lat: number) => {
  const i = nearestIndex(RIVER, at(lat, 11.876));
  return { name: 'Muson dei Sassi', at: RIVER[i], angle: labelAngle(RIVER, i) };
};

export const RIESE: MapDef = {
  id: 'riese',
  city: 'Riese Pio X',
  icon: '⛪',
  blurb: 'Il paese di San Pio X e le frazioni in campagna: poche stazioni, distanze lunghe.',
  width: W,
  height: H,
  land: [
    { name: 'RIESE', label: dirPoint(O, 40, 520), poly: ring(O, 620, 620, 32) },
    { name: 'SPINEDA E POGGIANA', label: dirPoint(O, 195, 1150), poly: wedge(O, 150, 240) },
    { name: 'SAN VITO', label: dirPoint(O, 265, 1150), poly: wedge(O, 240, 290) },
    { name: 'ALTIVOLE E FANZOLO', label: dirPoint(O, 335, 1150), poly: wedge(O, 290, 20) },
    { name: 'VALLÀ E CASTELFRANCO', label: dirPoint(O, 85, 1150), poly: wedge(O, 20, 150) },
  ],
  ground: rect(-100, -100, W + 100, H + 100),
  water: [{ poly: riverPoly(RIVER, 32) }],
  waterLabels: [musonAt(45.745), musonAt(45.70)],
  extraLabels: [],
  parks: [ring(at(45.73096, 11.91643), 45, 35, 10)],
  // la Castelfranco – Bassano passa da Castello di Godego, la Castelfranco – Montebelluna da Fanzolo
  rails: [CASTELFRANCO_RAILS[1], CASTELFRANCO_RAILS[3]].map((r) => smooth(pr.pts(r))),
  seeds: SEEDS,
  cores: [C],
  denseArea: 'RIESE',
  focus: { x: C.x, y: C.y + 60 },
  focusSize: { w: 1500, h: 1700 },
  welcome: 'Benvenuto a Riese Pio X! Il sindaco ha approvato le prime stazioni in centro: collegale e porta il metrò fino alle frazioni.',
};
