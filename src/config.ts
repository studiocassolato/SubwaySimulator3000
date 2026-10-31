import type { ZoneType } from './types';

export const CELL = 80;

export interface ZoneInfo {
  label: string;
  color: string;
  icon: string;
}

export const ZONES: Record<ZoneType, ZoneInfo> = {
  residential: { label: 'Residenziale', color: '#5aa469', icon: '🏠' },
  industrial: { label: 'Industriale', color: '#8d6e63', icon: '🏭' },
  offices: { label: 'Uffici e servizi', color: '#4a7bd0', icon: '🏢' },
  food: { label: 'Commercio e cibo', color: '#e8a33d', icon: '🍕' },
  hospital: { label: 'Ospedale', color: '#e05260', icon: '🏥' },
  school: { label: 'Scuola e università', color: '#9b6bd3', icon: '🎓' },
  leisure: { label: 'Svago e parchi', color: '#2bb3a8', icon: '🎡' },
};

export const ZONE_TYPES = Object.keys(ZONES) as ZoneType[];

export const LINE_COLORS = [
  '#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#6d4c41',
];

export const COST = {
  station: 300,
  trackPerUnit: 0.8,
  tunnel: 900,
  train: 700,
  trainUpkeepPerDay: 60,
  stationUpkeepPerDay: 10,
};

export const FARE_BASE = 4;
export const FARE_PER_HOP = 1.5;

export const STATION_RADIUS = 180; // bacino di utenza
export const TRAIN_SPEED = 70; // unità per minuto di gioco
export const DWELL = 4; // minuti di sosta in stazione
export const MAX_WAIT = 150; // minuti dopo cui il passeggero rinuncia
export const STATION_CAPACITY = 30;

export interface LevelInfo {
  population: number;
  maxLines: number;
  trainCapacity: number;
  unlock: string;
}

export const LEVELS: LevelInfo[] = [
  { population: 0, maxLines: 3, trainCapacity: 6, unlock: 'Inizio: 3 linee, treni da 6 posti' },
  { population: 200000, maxLines: 4, trainCapacity: 6, unlock: 'Livello 2: quarta linea' },
  { population: 450000, maxLines: 5, trainCapacity: 8, unlock: 'Livello 3: quinta linea, treni da 8 posti' },
  { population: 800000, maxLines: 6, trainCapacity: 10, unlock: 'Livello 4: sesta linea, treni da 10 posti' },
  { population: 1300000, maxLines: 8, trainCapacity: 12, unlock: 'Livello 5: 8 linee, treni da 12 posti' },
];

/** Quanti abitanti (o addetti) vale un punto di densità per tipo di zona */
export const POP_PER_DENSITY: Record<ZoneType, number> = {
  residential: 1200,
  industrial: 400,
  offices: 500,
  food: 250,
  hospital: 600,
  school: 400,
  leisure: 150,
};

/**
 * Domanda per fascia oraria: rate = moltiplicatore di generazione,
 * dest = pesi delle destinazioni.
 */
type Profile = { rate: number; dest: Partial<Record<ZoneType, number>> };

export function demandProfile(origin: ZoneType, hour: number): Profile {
  const morning = hour >= 6 && hour < 10;
  const midday = hour >= 10 && hour < 16;
  const evening = hour >= 16 && hour < 21;
  const night = hour >= 21 || hour < 6;
  if (origin === 'residential') {
    if (morning) return { rate: 1.6, dest: { industrial: 3, offices: 3, school: 2, hospital: 0.4, food: 0.5 } };
    if (midday) return { rate: 0.7, dest: { food: 3, offices: 1, hospital: 1, leisure: 1.5 } };
    if (evening) return { rate: 0.9, dest: { leisure: 3, food: 3, hospital: 0.5 } };
    return { rate: 0.15, dest: { leisure: 1, hospital: 1 } };
  }
  if (origin === 'hospital') return { rate: 0.5, dest: { residential: 3, food: 0.5 } };
  if (night) return { rate: origin === 'leisure' ? 0.6 : 0.1, dest: { residential: 1 } };
  if (evening) return { rate: 1.4, dest: { residential: 4, food: 1, leisure: 1 } };
  if (midday) {
    if (origin === 'food') return { rate: 0.7, dest: { residential: 2, offices: 2 } };
    return { rate: 0.4, dest: { food: 3, offices: 1, residential: 1 } };
  }
  return { rate: 0.2, dest: { residential: 1, offices: 1 } };
}


/** passeggeri in attesa oltre i quali parte il conto alla rovescia del sovraffollamento */
export const OVERCROWD_AT = 14;
/** minuti di sovraffollamento continuato prima della crisi di quartiere */
export const OVERCROWD_LIMIT = 120;
/** giorni perché una stazione nuova arrivi a piena domanda */
export const RAMP_DAYS = 1.5;
/** minuti perché il malcontento di una stazione scollegata arrivi al massimo */
export const DISCONTENT_MINUTES = { easy: 1440 * 4, normal: 1440 * 2.5 };
/** contributo comunale giornaliero per punto di reputazione */
export const GRANT_PER_REP = 30;
export const INITIAL_STATIONS = 12;
