import type { MapDef, Seed } from './maps';
import { dirPoint, labelAngle, nearestIndex, projector, rect, ring, riverPoly, seed, smooth, wedge, type LatLon } from './geo';
import type { Vec, ZoneType } from './types';

/**
 * Padova: il centro dentro le mura veneziane, i canali che lo circondano
 * (Tronco Maestro, Piovego, Scaricatore), il Prato della Valle con l'Isola Memmia,
 * il Brenta a nord-est e i quartieri fino a Ponte di Brenta e alla Mandria.
 * Posizioni da OpenStreetMap, proiettate "a lente" (vedi geo.ts): direzioni vere, centro ingrandito.
 */
const W = 5600;
const H = 5600;
const O = { x: 2800, y: 2800 };
/** Piazza dei Signori */
const CENTER: LatLon = [45.40772, 11.87345];
const pr = projector(CENTER, O, 2440, 2800);
const at = (lat: number, lon: number) => pr.pt([lat, lon]);
const C = at(...CENTER);

/** mura del Cinquecento: un vertice per ogni bastione o porta, in senso orario da nord */
const WALLS = pr.pts([
  [45.41869, 11.87295], [45.41837, 11.86799], [45.41642, 11.86396], [45.41227, 11.86476], [45.40772, 11.86395],
  [45.40508, 11.86427], [45.40373, 11.86395], [45.39948, 11.86422], [45.39618, 11.86561], [45.39055, 11.86791],
  [45.39243, 11.87403], [45.39244, 11.87492], [45.39418, 11.88059], [45.39833, 11.88415], [45.40031, 11.88489],
  [45.40288, 11.8917], [45.40453, 11.89683], [45.40678, 11.89782], [45.40905, 11.89852], [45.40968, 11.89268],
  [45.41063, 11.88595], [45.41315, 11.87977], [45.41639, 11.87596],
]);

const line = (pts: LatLon[]) => smooth(pr.pts(pts));
const RIVERS: { name: string; line: Vec[]; half: number; labelAt?: LatLon }[] = [
  {
    name: 'Bacchiglione', half: 34, labelAt: [45.388, 11.84],
    line: line([[45.392, 11.7955], [45.3941, 11.8006], [45.3912, 11.8046], [45.3887, 11.8092], [45.3873, 11.816], [45.3877, 11.8222], [45.3881, 11.8284], [45.3896, 11.8307], [45.3917, 11.8368], [45.3902, 11.8429], [45.3881, 11.8484], [45.3852, 11.8527], [45.3858, 11.8591], [45.387, 11.866]]),
  },
  {
    name: 'Tronco Maestro', half: 22, labelAt: [45.4054, 11.8682],
    line: line([[45.387, 11.866], [45.3911, 11.8672], [45.3955, 11.8659], [45.3995, 11.8653], [45.4014, 11.8674], [45.4054, 11.8682], [45.4097, 11.8681], [45.4117, 11.8737], [45.4134, 11.8783]]),
  },
  {
    name: 'Piovego', half: 22, labelAt: [45.4064, 11.91],
    line: line([[45.4134, 11.8783], [45.4111, 11.883], [45.4102, 11.8901], [45.4093, 11.897], [45.4053, 11.8979], [45.4058, 11.9038], [45.4064, 11.9097], [45.4065, 11.9187], [45.4066, 11.9246], [45.4068, 11.9297], [45.4072, 11.9473], [45.4073, 11.9544], [45.408, 11.98]]),
  },
  {
    name: 'Scaricatore', half: 30, labelAt: [45.3846, 11.887],
    line: line([[45.387, 11.866], [45.385, 11.8814], [45.3844, 11.8923], [45.3838, 11.903], [45.3831, 11.916], [45.3815, 11.9214], [45.3776, 11.9245], [45.3753, 11.93], [45.371, 11.9316], [45.3676, 11.9326], [45.355, 11.94]]),
  },
  {
    name: 'San Gregorio', half: 16,
    line: line([[45.4066, 11.9246], [45.3986, 11.9146], [45.3945, 11.9121], [45.3876, 11.908], [45.3858, 11.9053], [45.3838, 11.903]]),
  },
  {
    name: 'Brentella', half: 16, labelAt: [45.43, 11.8288],
    line: line([[45.475, 11.836], [45.4585, 11.8336], [45.449, 11.8302], [45.4401, 11.8289], [45.4309, 11.8288], [45.4221, 11.828], [45.4174, 11.8274], [45.4082, 11.8266], [45.3983, 11.8253], [45.3942, 11.8248], [45.3907, 11.8281], [45.3896, 11.8307]]),
  },
  {
    name: 'Brenta', half: 46, labelAt: [45.4458, 11.8978],
    line: line([[45.4656, 11.8622], [45.4612, 11.8635], [45.4562, 11.8601], [45.4533, 11.8647], [45.4543, 11.8725], [45.454, 11.8792], [45.4498, 11.8847], [45.447, 11.8917], [45.4458, 11.8978], [45.4414, 11.9061], [45.4402, 11.9133], [45.4383, 11.9208], [45.4366, 11.9283], [45.4374, 11.9345], [45.4343, 11.9423], [45.4288, 11.9501], [45.42, 11.97]]),
  },
];

/** Prato della Valle: la canaletta ellittica attorno all'Isola Memmia */
const PRATO = at(45.39843, 11.87652);

const S = (name: string, type: ZoneType, lat: number, lon: number, r: number): Seed => seed(name, type, at(lat, lon), r);
const STATION: LatLon = [45.41774, 11.8805];

const SEEDS: Seed[] = [
  // dentro le mura
  S('Piazza dei Signori', 'food', ...CENTER, 120),
  S('Palazzo del Bo', 'school', 45.40674, 11.87746, 110),
  S('Duomo', 'leisure', 45.40652, 11.87126, 90),
  S('Ponte Molino', 'food', 45.4098, 11.8736, 100),
  S('Cappella degli Scrovegni', 'leisure', 45.41186, 11.87949, 110),
  S('Prato della Valle', 'leisure', 45.39843, 11.87652, 130),
  S('Basilica del Santo', 'leisure', 45.40146, 11.88093, 110),
  S('Orto Botanico', 'leisure', 45.39853, 11.8806, 80),
  S('La Specola', 'school', 45.40191, 11.86857, 90),
  S('Ospedale', 'hospital', 45.40284, 11.88691, 90),
  S('Portello e Ingegneria', 'school', 45.40959, 11.88848, 120),
  S('Porta Savonarola', 'residential', 45.41227, 11.86476, 180),
  S('Porta San Giovanni', 'residential', 45.40508, 11.86427, 180),
  S('Pontecorvo', 'residential', 45.40031, 11.88489, 160),
  S('Stadio Appiani', 'leisure', 45.39387, 11.87528, 80),
  // stazione e nord
  S('Stazione', 'offices', ...STATION, 160),
  S('Fiera', 'offices', 45.41484, 11.8906, 150),
  S('Arcella', 'residential', 45.42266, 11.88349, 300),
  S('San Carlo', 'residential', 45.43161, 11.8896, 260),
  S('Sacro Cuore', 'residential', 45.43336, 11.87022, 240),
  S('Pontevigodarzere', 'residential', 45.44399, 11.89396, 260),
  S('Altichiero', 'residential', 45.44771, 11.87186, 240),
  S('Stadio Euganeo', 'leisure', 45.43243, 11.85828, 140),
  S('Montà', 'residential', 45.4305, 11.84192, 240),
  S("Sant'Ignazio", 'residential', 45.42403, 11.85278, 220),
  // ovest
  S('Chiesanuova', 'residential', 45.41777, 11.83534, 260),
  S('Cave', 'residential', 45.40922, 11.84301, 220),
  S('Le Brentelle', 'food', 45.41673, 11.8243, 160),
  S('Brusegana', 'residential', 45.39668, 11.8288, 260),
  S('Sacra Famiglia', 'residential', 45.39007, 11.86421, 220),
  // sud
  S('Bassanello', 'food', 45.3885, 11.8702, 140),
  S('Guizza', 'residential', 45.38116, 11.86998, 260),
  S('Paltana', 'residential', 45.38327, 11.85573, 220),
  S('Ipercity', 'food', 45.37781, 11.85519, 160),
  S('Mandria', 'residential', 45.36916, 11.83419, 260),
  S('Madonna Pellegrina', 'residential', 45.38816, 11.88054, 200),
  S('Santa Rita', 'residential', 45.39516, 11.88819, 200),
  S('Ospedale Sant\'Antonio', 'hospital', 45.39326, 11.89254, 80),
  S('Crocifisso', 'residential', 45.37764, 11.88576, 220),
  S('Voltabarozzo', 'residential', 45.3798, 11.90214, 240),
  // est
  S('Forcellini', 'residential', 45.39704, 11.89892, 220),
  S('Parco Iris', 'leisure', 45.39288, 11.89911, 120),
  S('Terranegra', 'residential', 45.39432, 11.90971, 220),
  S('Stanga', 'offices', 45.40894, 11.90205, 180),
  S('Centro Giotto', 'food', 45.41157, 11.90733, 140),
  S('San Lazzaro', 'residential', 45.41705, 11.91522, 220),
  S('Kioene Arena', 'leisure', 45.41803, 11.92263, 120),
  S('Mortise', 'residential', 45.42569, 11.91261, 240),
  S('Torre', 'residential', 45.43639, 11.92003, 240),
  S('Zona Industriale', 'industrial', 45.403, 11.932, 380),
  S('Interporto', 'industrial', 45.38899, 11.9296, 300),
  S('Camin', 'residential', 45.39808, 11.94348, 240),
  S('Granze di Camin', 'residential', 45.37961, 11.93986, 220),
  S('Ponte di Brenta', 'residential', 45.42487, 11.94568, 260),
];

const riverLabels = RIVERS.filter((r) => r.labelAt).map((r) => {
  const i = nearestIndex(r.line, at(...(r.labelAt as LatLon)));
  return { name: r.name, at: r.line[i], angle: labelAngle(r.line, i), size: r.half > 30 ? 15 : 12 };
});

export const PADOVA: MapDef = {
  id: 'padova',
  city: 'Padova',
  icon: '🎓',
  blurb: 'La città del Santo: mura veneziane, canali da attraversare in galleria e tanti studenti.',
  width: W,
  height: H,
  land: [
    { name: 'CENTRO STORICO', poly: WALLS },
    { name: 'ARCELLA E SAN CARLO', label: dirPoint(O, 285, 1750), poly: wedge(O, 235, 320) },
    { name: 'STANGA E ZONA INDUSTRIALE', label: dirPoint(O, 0, 1900), poly: wedge(O, 320, 50) },
    { name: 'GUIZZA E VOLTABAROZZO', label: dirPoint(O, 95, 1750), poly: wedge(O, 50, 140) },
    { name: 'BRUSEGANA E CHIESANUOVA', label: dirPoint(O, 185, 1800), poly: wedge(O, 140, 235) },
  ],
  ground: rect(-100, -100, W + 100, H + 100),
  water: [
    ...RIVERS.map((r) => ({ poly: riverPoly(r.line, r.half) })),
    { poly: ring(PRATO, 78, 118, 28), holes: [ring(PRATO, 58, 98, 28)] },
  ],
  waterLabels: riverLabels,
  extraLabels: [],
  parks: [
    ring(PRATO, 56, 96, 28),
    ring(at(45.41215, 11.8801), 50, 38, 12), // Giardini dell'Arena
    ring(at(45.39288, 11.89911), 70, 55, 12), // Parco Iris
    ring(at(45.39853, 11.8806), 40, 34, 10), // Orto Botanico
  ],
  walls: WALLS,
  rails: [
    // verso Venezia
    [[45.41774, 11.8805], [45.4181, 11.8908], [45.42, 11.9004], [45.4219, 11.9101], [45.4242, 11.9221], [45.4272, 11.9375], [45.4294, 11.9485], [45.432, 11.97]],
    // verso Vicenza
    [[45.41774, 11.8805], [45.4196, 11.8732], [45.4219, 11.8674], [45.4272, 11.8549], [45.4324, 11.8426], [45.4371, 11.8316], [45.442, 11.81]],
    // verso Castelfranco e Bassano
    [[45.4196, 11.8732], [45.4233, 11.8696], [45.427, 11.8722], [45.437, 11.881], [45.4471, 11.8897], [45.4586, 11.8919], [45.4743, 11.8935]],
    // verso Bologna
    [[45.4186, 11.8762], [45.4184, 11.8612], [45.4163, 11.8593], [45.4078, 11.8527], [45.3952, 11.8426], [45.3911, 11.8396], [45.3757, 11.8269], [45.36, 11.815]],
  ].map((r) => smooth(pr.pts(r as LatLon[]))),
  seeds: SEEDS,
  cores: [C, at(...STATION), at(45.40146, 11.88093), at(45.42266, 11.88349)],
  denseArea: 'CENTRO STORICO',
  focus: { x: C.x + 60, y: C.y + 40 },
  focusSize: { w: 2200, h: 2400 },
  welcome: 'Benvenuto a Padova! Il sindaco ha approvato le prime stazioni in centro, tra le piazze e il Bo: collegale con le linee.',
};
