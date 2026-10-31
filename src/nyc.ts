import type { LandMass, MapDef, Seed } from './maps';
import type { Vec, ZoneType } from './types';

/**
 * New York stilizzata, disegnata a mano (non in scala esatta).
 * Coordinate di gioco: x verso est, y verso sud, 1 unità ≈ 8 m.
 */

const P = (pts: [number, number][]): Vec[] => pts.map(([x, y]) => ({ x, y }));

const LAND: LandMass[] = [
  {
    name: 'NEW JERSEY',
    label: { x: 650, y: 1900 },
    poly: P([
      [0, 0], [1640, 0], [1600, 300], [1540, 600], [1460, 1000], [1380, 1400], [1300, 1800], [1230, 2200],
      [1170, 2600], [1120, 3000], [1060, 3300], [960, 3550], [820, 3800], [640, 4100], [520, 4400],
      [460, 4800], [420, 5200], [0, 5200],
    ]),
  },
  {
    name: 'MANHATTAN',
    label: { x: 1560, y: 2030 },
    poly: P([
      [1880, 90], [1790, 250], [1720, 550], [1650, 850], [1580, 1200], [1510, 1550], [1440, 1900],
      [1380, 2250], [1330, 2600], [1290, 2950], [1270, 3250], [1320, 3450], [1420, 3520], [1520, 3450],
      [1600, 3300], [1680, 3050], [1740, 2750], [1790, 2450], [1840, 2150], [1880, 1850], [1900, 1550],
      [1930, 1300], [1960, 1050], [1990, 800], [2000, 550], [1990, 300], [1950, 150],
    ]),
  },
  {
    name: 'THE BRONX',
    label: { x: 3000, y: 750 },
    poly: P([
      [2080, 0], [4200, 0], [4200, 950], [3700, 1000], [3300, 1080], [2900, 1060], [2600, 1020],
      [2300, 1000], [2120, 900], [2080, 650], [2080, 350], [2050, 120],
    ]),
  },
  {
    name: 'QUEENS',
    label: { x: 3450, y: 2150 },
    // Queens e Brooklyn sono la stessa terraferma (Long Island)
    poly: P([
      [2000, 1150], [2300, 1150], [2700, 1180], [3100, 1200], [3500, 1160], [3900, 1120], [4200, 1100],
      [4200, 4250], [3700, 4200], [3300, 4320], [2900, 4450], [2550, 4550], [2200, 4560], [1900, 4500],
      [1700, 4380], [1660, 4150], [1640, 3900], [1650, 3650], [1720, 3450], [1780, 3250], [1840, 3000],
      [1900, 2700], [1960, 2400], [2010, 2100], [2030, 1800], [2010, 1500],
    ]),
  },
  {
    name: 'STATEN ISLAND',
    label: { x: 1060, y: 4880 },
    poly: P([
      [700, 4350], [1000, 4200], [1300, 4250], [1500, 4450], [1580, 4750], [1500, 5050], [1350, 5200],
      [650, 5200], [560, 4800],
    ]),
  },
];

const BROOKLYN_LABEL = { x: 2350, y: 3950 };

const WATER_LABELS = [
  { name: 'Hudson River', at: { x: 1440, y: 1350 }, angle: -1.35 },
  { name: 'East River', at: { x: 1880, y: 2720 }, angle: -1.4 },
  { name: 'Harlem River', at: { x: 2035, y: 520 }, angle: -1.55 },
  { name: 'Upper Bay', at: { x: 1300, y: 3900 }, angle: 0 },
  { name: 'Atlantic Ocean', at: { x: 3300, y: 4900 }, angle: 0 },
];

const CENTRAL_PARK = P([[1650, 1450], [1765, 1470], [1700, 1960], [1585, 1940]]);

const S = (name: string, type: ZoneType, x: number, y: number, r: number): Seed => ({ name, type, x, y, r });

const SEEDS: Seed[] = [
  // Manhattan
  S('Financial District', 'offices', 1420, 3330, 220),
  S('Tribeca', 'residential', 1360, 3050, 200),
  S('Chinatown', 'food', 1560, 3130, 130),
  S('Greenwich Village', 'residential', 1400, 2780, 220),
  S('Washington Square', 'school', 1510, 2860, 100),
  S('East Village', 'residential', 1660, 2850, 220),
  S('Chelsea', 'residential', 1410, 2500, 220),
  S('Midtown', 'offices', 1640, 2250, 260),
  S('Times Square', 'leisure', 1500, 2300, 90),
  S('Kips Bay', 'hospital', 1770, 2560, 60),
  S("Hell's Kitchen", 'food', 1430, 2150, 110),
  S('Upper West Side', 'residential', 1530, 1650, 300),
  S('Upper East Side', 'residential', 1830, 1750, 300),
  S('East Harlem', 'hospital', 1880, 1430, 60),
  S('Morningside Heights', 'school', 1580, 1240, 110),
  S('Harlem', 'residential', 1760, 1100, 300),
  S('Washington Heights', 'residential', 1800, 560, 300),
  S('Inwood', 'residential', 1890, 220, 200),
  // Bronx
  S('Yankee Stadium', 'leisure', 2180, 800, 100),
  S('South Bronx', 'residential', 2380, 880, 300),
  S('Hunts Point', 'industrial', 2700, 940, 180),
  S('Bronx Zoo', 'leisure', 2850, 480, 150),
  S('Fordham', 'school', 2480, 380, 110),
  S('Riverdale', 'residential', 2230, 180, 300),
  S('Tremont', 'hospital', 2430, 640, 60),
  S('Pelham', 'residential', 3500, 500, 400),
  S('Co-op City', 'residential', 3950, 300, 300),
  S('Throgs Neck', 'industrial', 3900, 850, 160),
  // Queens
  S('Long Island City', 'offices', 2110, 1900, 150),
  S('Astoria', 'residential', 2250, 1330, 300),
  S('Ditmars', 'food', 2340, 1420, 100),
  S('Sunnyside', 'residential', 2400, 1900, 250),
  S('Maspeth', 'industrial', 2580, 2350, 200),
  S('Jackson Heights', 'food', 2800, 1650, 120),
  S('Corona', 'leisure', 3050, 1500, 110),
  S('Flushing', 'food', 3320, 1430, 160),
  S('Forest Hills', 'residential', 3050, 2200, 300),
  S('Queens College', 'school', 3330, 1880, 100),
  S('Jamaica', 'hospital', 3420, 2500, 60),
  S('Jamaica Center', 'residential', 3550, 2650, 350),
  S('Bayside', 'residential', 3900, 1500, 350),
  S('JFK', 'industrial', 3700, 3700, 350),
  S('Rockaway', 'leisure', 3950, 4150, 150),
  // Brooklyn
  S('Downtown Brooklyn', 'offices', 1850, 3330, 140),
  S('Navy Yard', 'industrial', 1930, 3080, 110),
  S('Williamsburg', 'food', 2000, 2760, 140),
  S('Greenpoint', 'residential', 2040, 2360, 220),
  S('Bushwick', 'residential', 2400, 2900, 300),
  S('Red Hook', 'industrial', 1730, 3660, 140),
  S('Park Slope', 'residential', 2040, 3700, 250),
  S('Prospect Park', 'leisure', 2250, 3760, 140),
  S('Bed-Stuy', 'residential', 2350, 3300, 300),
  S('Crown Heights', 'hospital', 2480, 3480, 60),
  S('Flatbush', 'residential', 2550, 3700, 300),
  S('Midwood', 'school', 2560, 4060, 110),
  S('Bay Ridge', 'residential', 1820, 4300, 300),
  S('Coney Island', 'leisure', 2450, 4470, 160),
  S('Brighton Beach', 'food', 2750, 4420, 110),
  S('East New York', 'industrial', 3000, 3200, 180),
  S('Canarsie', 'residential', 3200, 3900, 350),
  // New Jersey
  S('Fort Lee', 'residential', 1430, 600, 300),
  S('Union City', 'residential', 1250, 1800, 300),
  S('Hoboken', 'food', 1220, 2400, 110),
  S('Hoboken Nord', 'residential', 1180, 2200, 220),
  S('Jersey City', 'residential', 1040, 2950, 300),
  S('Exchange Place', 'offices', 1120, 3150, 130),
  S('Liberty Park', 'leisure', 1000, 3420, 110),
  S('Bayonne', 'residential', 820, 3900, 300),
  S('Newark', 'industrial', 400, 2800, 420),
  S('Port Newark', 'industrial', 480, 3700, 300),
  S('Meadowlands', 'leisure', 850, 1450, 160),
  S('Journal Square', 'hospital', 930, 2650, 60),
  S('Paterson', 'residential', 500, 900, 450),
  // Staten Island
  S('St. George', 'offices', 1330, 4320, 100),
  S('Stapleton', 'residential', 1300, 4600, 250),
  S('Mariners Harbor', 'industrial', 760, 4520, 150),
  S('Castleton', 'hospital', 1150, 4560, 60),
  S('Freshkills', 'leisure', 820, 5000, 160),
  S('Great Kills', 'residential', 1250, 5000, 300),
];

/** Centri d'affari: la densità iniziale cala allontanandosi da qui. */
const CORES = P([[1640, 2250], [1420, 3330], [1850, 3330], [2110, 1900], [1120, 3150]]);

export const NYC: MapDef = {
  id: 'nyc',
  city: 'New York',
  icon: '🗽',
  blurb: 'Cinque distretti, fiumi da attraversare in galleria e una domanda enorme.',
  width: 4200,
  height: 5200,
  land: LAND,
  water: [],
  waterLabels: WATER_LABELS,
  extraLabels: [{ name: 'BROOKLYN', at: BROOKLYN_LABEL }],
  parks: [CENTRAL_PARK],
  seeds: SEEDS,
  cores: CORES,
  denseArea: 'MANHATTAN',
  focus: { x: 1650, y: 2500 },
  focusSize: { w: 1800, h: 2400 },
  welcome: 'Benvenuto a New York! Il sindaco ha approvato le prime stazioni: collegale con le linee.',
};
