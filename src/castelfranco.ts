import type { MapDef, Seed } from './maps';
import { dirPoint, labelAngle, nearestIndex, projector, rect, riverPoly, ring, scalePoly, seed, sideOf, smooth, wedge, type LatLon } from './geo';
import type { ZoneType } from './types';
import { CASTELFRANCO_RAILS, CASTELFRANCO_STATION, MUSON } from './veneto';

/**
 * Castelfranco Veneto. Le posizioni vengono da OpenStreetMap e sono proiettate "a lente"
 * (vedi geo.ts): le direzioni sono quelle vere, il centro storico è ingrandito
 * e le frazioni più lontane sono avvicinate. Coordinate di gioco: x verso est, y verso sud.
 */
const W = 3800;
const H = 3800;
const O = { x: 1900, y: 1900 };
/** centro della cinta murata */
const CASTLE: LatLon = [45.67135, 11.92605];
const pr = projector(CASTLE, O, 543, 300);
const at = (lat: number, lon: number) => pr.pt([lat, lon]);
const C = at(...CASTLE);

/** le mura vere: un quadrato di circa 230 m di lato, ruotato di una ventina di gradi */
const WALLS = pr.pts([[45.67271, 11.92692], [45.67078, 11.92813], [45.67001, 11.92524], [45.67197, 11.92402]]);
const MOAT_IN = scalePoly(WALLS, 1.1);
const MOAT_OUT = scalePoly(WALLS, 1.42);

const RIVER = smooth(pr.pts(MUSON));

const S = (name: string, type: ZoneType, lat: number, lon: number, r: number): Seed => seed(name, type, at(lat, lon), r);

const SEEDS: Seed[] = [
  // centro storico: Piazza Giorgione è appena a nord del castello, oltre il fossato
  S('Castello', 'leisure', ...CASTLE, 120),
  S('Piazza Giorgione', 'food', 45.6733, 11.9256, 130),
  S('Borgo Padova', 'residential', 45.6683, 11.9248, 200),
  S('Borgo Asolo', 'residential', 45.6757, 11.9264, 220),
  S('Stazione', 'offices', ...CASTELFRANCO_STATION, 130),
  S('Villa Revedin Bolasco', 'leisure', 45.67246, 11.9333, 140),
  S('Ospedale San Giacomo', 'hospital', 45.67637, 11.93089, 70),
  S('Liceo Giorgione', 'school', 45.67107, 11.9398, 100),
  S('Istituto Galilei', 'school', 45.67937, 11.92466, 90),
  S('Stadio Ostani', 'leisure', 45.66684, 11.92657, 100),
  S('Palazzetto dello Sport', 'leisure', 45.67196, 11.92134, 90),
  S('Centro Giorgione', 'food', 45.67051, 11.91589, 110),
  S('Giardini del Sole', 'food', 45.68168, 11.94229, 140),
  S('Istituto Agrario', 'school', 45.69174, 11.94681, 100),
  // zone produttive
  S('Zona Industriale Est', 'industrial', 45.6718, 11.9624, 320),
  S('Cartiera', 'industrial', 45.65531, 11.9408, 260),
  S('Zona Industriale Ovest', 'industrial', 45.6845, 11.8909, 280),
  // frazioni
  S('Salvarosa', 'residential', 45.6812, 11.95147, 280),
  S('Villarazzo', 'residential', 45.68019, 11.9049, 260),
  S('Bella Venezia', 'residential', 45.68613, 11.91777, 240),
  S('Treville', 'residential', 45.65387, 11.90936, 260),
  S('Campigo', 'residential', 45.65573, 11.96253, 260),
  S('Salvatronda', 'residential', 45.67448, 11.9766, 260),
  S('San Floriano', 'residential', 45.69468, 11.97346, 240),
  S("Sant'Andrea oltre il Muson", 'residential', 45.64799, 11.89702, 260),
  S('Soranza', 'residential', 45.66296, 11.89148, 220),
  // paesi vicini
  S('Vallà', 'residential', 45.70599, 11.93097, 240),
  S('Riese Pio X', 'residential', 45.72922, 11.917, 240),
  S('Castello di Godego', 'residential', 45.69238, 11.88104, 240),
  S('Loria', 'residential', 45.72842, 11.86558, 220),
  S('San Martino di Lupari', 'residential', 45.64866, 11.85698, 240),
  S('Resana', 'residential', 45.63457, 11.95543, 240),
  S('Castelminio', 'residential', 45.64479, 11.98965, 220),
  S('Fanzolo e Villa Emo', 'leisure', 45.71169, 11.99128, 200),
  S('Vedelago', 'residential', 45.68676, 12.01885, 240),
];

const musonAt = (lat: number) => {
  const i = nearestIndex(RIVER, at(lat, 11.89));
  return { name: 'Muson dei Sassi', at: RIVER[i], angle: labelAngle(RIVER, i) };
};

export const CASTELFRANCO: MapDef = {
  id: 'castelfranco',
  city: 'Castelfranco Veneto',
  icon: '🏰',
  blurb: 'Il castello col fossato, il Muson e le frazioni: una città piccola da far crescere.',
  width: W,
  height: H,
  // l'ordine conta: vince il primo distretto che contiene il punto
  land: [
    { name: 'CASTELLO', poly: WALLS },
    { name: 'OLTRE MUSON', label: at(45.668, 11.875), poly: sideOf(RIVER, 'west', W, H) },
    { name: 'CASTELFRANCO', label: at(45.6605, 11.9345), poly: ring(O, 900, 900, 32) },
    { name: 'SALVAROSA E SAN FLORIANO', label: dirPoint(O, 300, 1350), poly: wedge(O, 250, 340) },
    { name: 'SALVATRONDA E CAMPIGO', label: dirPoint(O, 15, 1350), poly: wedge(O, 340, 60) },
    { name: 'TREVILLE E RESANA', label: dirPoint(O, 118, 1500), poly: wedge(O, 60, 160) },
    { name: 'VILLARAZZO E BELLA VENEZIA', label: dirPoint(O, 222, 1450), poly: wedge(O, 160, 250) },
  ],
  ground: rect(-100, -100, W + 100, H + 100),
  water: [
    { poly: riverPoly(RIVER, 36) },
    { poly: MOAT_OUT, holes: [MOAT_IN] },
  ],
  waterLabels: [musonAt(45.715), musonAt(45.63)],
  extraLabels: [],
  parks: [ring(at(45.67419, 11.93433), 80, 60, 12)],
  walls: WALLS,
  rails: CASTELFRANCO_RAILS.map((r) => smooth(pr.pts(r))),
  seeds: SEEDS,
  cores: [C, at(...CASTELFRANCO_STATION)],
  denseArea: 'CASTELLO',
  focus: { x: C.x + 80, y: C.y + 120 },
  focusSize: { w: 1600, h: 1900 },
  welcome: 'Benvenuto a Castelfranco Veneto! Il sindaco ha approvato le prime stazioni attorno al castello: collegale con le linee.',
};
