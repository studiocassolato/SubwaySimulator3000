import type { MapDef, Seed } from './maps';
import { dirPoint, labelAngle, nearestIndex, projector, pushOut, rect, ring, riverPoly, scalePoly, seed, sideOf, smooth, wedge, type LatLon } from './geo';
import type { ZoneType } from './types';

/**
 * Cittadella: la cinta muraria quasi circolare con le quattro porte e il fossato,
 * il Brenta a ovest e le due ferrovie che si incrociano in stazione.
 * Posizioni da OpenStreetMap, proiettate "a lente" (vedi geo.ts): direzioni vere, centro ingrandito.
 */
const W = 3800;
const H = 3800;
const O = { x: 1900, y: 1900 };
/** centro della cinta muraria */
const CENTER: LatLon = [45.6488, 11.7836];
const pr = projector(CENTER, O, 680, 500);
const at = (lat: number, lon: number) => pr.pt([lat, lon]);
const C = at(...CENTER);

/** il tracciato vero delle mura (OSM): ogni vertice diventa una torre */
const WALLS = pr.pts([
  [45.65086, 11.78313], [45.6507, 11.78261], [45.65044, 11.7822], [45.65002, 11.78171], [45.64965, 11.78145],
  [45.64938, 11.78117], [45.64904, 11.78086], [45.64871, 11.7806], [45.6484, 11.78064], [45.64801, 11.78085],
  [45.64769, 11.78113], [45.6474, 11.78148], [45.64714, 11.78188], [45.64668, 11.78275], [45.64656, 11.78408],
  [45.64653, 11.78482], [45.64676, 11.78534], [45.64759, 11.78596], [45.64834, 11.78625], [45.64874, 11.78634],
  [45.64922, 11.7863], [45.6496, 11.78612], [45.64998, 11.78587], [45.65035, 11.78564], [45.65064, 11.78525],
  [45.65086, 11.78478], [45.65103, 11.78423], [45.65099, 11.78364],
]);
const MOAT_IN = scalePoly(WALLS, 1.08);
const MOAT_OUT = scalePoly(WALLS, 1.3);
const moatR = Math.max(...MOAT_OUT.map((p) => Math.hypot(p.x - C.x, p.y - C.y)));

const BRENTA = smooth(pr.pts([
  [45.7731, 11.7313], [45.7619, 11.7266], [45.7561, 11.7126], [45.7476, 11.7025], [45.7364, 11.6973], [45.7253, 11.6958],
  [45.7143, 11.6893], [45.7028, 11.6871], [45.6916, 11.6859], [45.6796, 11.686], [45.6693, 11.6905], [45.6629, 11.7032],
  [45.6539, 11.712], [45.6431, 11.7199], [45.6344, 11.7313], [45.6268, 11.743], [45.6159, 11.7469], [45.6055, 11.7523],
  [45.6005, 11.7575], [45.5951, 11.7654], [45.5882, 11.7604], [45.5807, 11.7587], [45.5734, 11.7597],
]));

const S = (name: string, type: ZoneType, lat: number, lon: number, r: number): Seed => seed(name, type, at(lat, lon), r);
/** le porte stanno sul fossato: la stazione del metrò va appena fuori */
const gate = (name: string, type: ZoneType, lat: number, lon: number, r: number): Seed =>
  seed(name, type, pushOut(C, at(lat, lon), moatR + 70), r);

const STATION: LatLon = [45.64392, 11.78956];

const SEEDS: Seed[] = [
  S('Duomo', 'food', 45.64892, 11.78401, 140),
  S('Campo della Marta', 'leisure', 45.64775, 11.7816, 90),
  gate('Porta Bassano', 'food', 45.65078, 11.78321, 140),
  gate('Porta Padova e Torre di Malta', 'leisure', 45.64649, 11.78404, 130),
  gate('Porta Vicenza', 'residential', 45.64839, 11.78045, 200),
  gate('Porta Treviso', 'residential', 45.64914, 11.78652, 200),
  S('Stazione', 'offices', ...STATION, 140),
  S('Ospedale', 'hospital', 45.64716, 11.78876, 70),
  S('Liceo Tito Lucrezio Caro', 'school', 45.64497, 11.77616, 100),
  S('Stadio Tombolato', 'leisure', 45.64297, 11.78115, 110),
  S('Centro commerciale Le Torri', 'food', 45.65715, 11.78308, 120),
  S('Borgo Treviso', 'residential', 45.6517, 11.79668, 240),
  S('Villa Ca\' Nave', 'leisure', 45.63896, 11.78701, 110),
  S('Zona Industriale', 'industrial', 45.6428, 11.8044, 320),
  S('Zona Industriale Nord', 'industrial', 45.68, 11.7655, 260),
  // frazioni
  S('Pozzetto', 'residential', 45.66589, 11.77752, 260),
  S("Ca' Onorai", 'residential', 45.67101, 11.80019, 260),
  S('Facca', 'residential', 45.61911, 11.79529, 260),
  S('Laghi', 'residential', 45.67869, 11.75617, 240),
  S('Cà Vico', 'residential', 45.6838, 11.79578, 220),
  S('Corte', 'residential', 45.67172, 11.81133, 200),
  // paesi vicini
  S('Fontaniva', 'residential', 45.63763, 11.7522, 260),
  S('Fratta', 'residential', 45.64459, 11.74487, 200),
  S('San Giorgio in Brenta', 'residential', 45.61364, 11.76714, 220),
  S('Tombolo', 'residential', 45.64703, 11.83042, 240),
  S('Onara', 'residential', 45.62677, 11.82027, 200),
  S('Galliera Veneta', 'residential', 45.66284, 11.82849, 240),
  S('San Martino di Lupari', 'residential', 45.64866, 11.85698, 260),
  S('Belvedere', 'residential', 45.68507, 11.77296, 200),
  S('Rossano Veneto', 'residential', 45.70527, 11.79979, 240),
];

const brentaAt = (lat: number) => {
  const i = nearestIndex(BRENTA, at(lat, 11.71));
  return { name: 'Brenta', at: BRENTA[i], angle: labelAngle(BRENTA, i), size: 16 };
};

export const CITTADELLA: MapDef = {
  id: 'cittadella',
  city: 'Cittadella',
  icon: '🛡️',
  blurb: 'La città murata col cammino di ronda, il Brenta e due ferrovie che si incrociano.',
  width: W,
  height: H,
  land: [
    { name: 'CENTRO MURATO', poly: WALLS },
    { name: 'OLTRE BRENTA', label: at(45.66, 11.695), poly: sideOf(BRENTA, 'west', W, H) },
    { name: 'CITTADELLA', label: dirPoint(O, 120, 760), poly: ring(O, 950, 950, 32) },
    { name: "POZZETTO E CA' ONORAI", label: dirPoint(O, 280, 1350), poly: wedge(O, 225, 315) },
    { name: 'TOMBOLO E GALLIERA', label: dirPoint(O, 5, 1350), poly: wedge(O, 315, 45) },
    { name: 'FACCA E ONARA', label: dirPoint(O, 95, 1350), poly: wedge(O, 45, 135) },
    { name: 'FONTANIVA', label: dirPoint(O, 185, 1150), poly: wedge(O, 135, 225) },
  ],
  ground: rect(-100, -100, W + 100, H + 100),
  water: [
    { poly: riverPoly(BRENTA, 70) },
    { poly: MOAT_OUT, holes: [MOAT_IN] },
  ],
  waterLabels: [brentaAt(45.72), brentaAt(45.63)],
  extraLabels: [],
  parks: [ring(at(45.64733, 11.78214), 45, 35, 10)],
  walls: WALLS,
  rails: [
    // verso Castelfranco e Treviso
    [[45.64392, 11.78956], [45.6463, 11.7903], [45.649, 11.7921], [45.6504, 11.8011], [45.6515, 11.8147], [45.6529, 11.8284], [45.6548, 11.8471], [45.656, 11.8586], [45.6585, 11.8771]],
    // verso Vicenza
    [[45.64392, 11.78956], [45.6404, 11.7891], [45.6367, 11.7781], [45.6355, 11.7625], [45.6349, 11.7495], [45.632, 11.72], [45.628, 11.69]],
    // verso Bassano
    [[45.6463, 11.7903], [45.6537, 11.7917], [45.6597, 11.7952], [45.6667, 11.7949], [45.6756, 11.7924], [45.6888, 11.7886], [45.6932, 11.7873], [45.72, 11.78]],
    // verso Padova
    [[45.6404, 11.7891], [45.6381, 11.7891], [45.6327, 11.794], [45.628, 11.805], [45.6234, 11.8159], [45.6182, 11.8279], [45.6093, 11.8488]],
  ].map((r) => smooth(pr.pts(r as LatLon[]))),
  seeds: SEEDS,
  cores: [C, at(...STATION)],
  denseArea: 'CENTRO MURATO',
  focus: { x: C.x + 60, y: C.y + 100 },
  focusSize: { w: 1600, h: 1800 },
  welcome: 'Benvenuto a Cittadella! Il sindaco ha approvato le prime stazioni dentro e attorno alle mura: collegale con le linee.',
};
