export type ZoneType =
  | 'residential'
  | 'industrial'
  | 'offices'
  | 'food'
  | 'hospital'
  | 'school'
  | 'leisure';

export interface Vec {
  x: number;
  y: number;
}

/** Un isolato della città. density 0 = terreno non ancora edificato. */
export interface Cell {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: ZoneType;
  density: number;
}

export interface Passenger {
  dest: ZoneType;
  /** minuto di gioco in cui ha iniziato ad aspettare */
  since: number;
  /** fermate percorse finora */
  hops: number;
}

export interface Station {
  id: number;
  x: number;
  y: number;
  name: string;
  waiting: Passenger[];
  /** contatore passeggeri consegnati qui, usato per la crescita */
  served: number;
}

export interface Line {
  id: number;
  color: string;
  name: string;
  stations: number[];
}

export interface Train {
  id: number;
  lineId: number;
  /** distanza percorsa lungo il tracciato della linea */
  pos: number;
  dir: 1 | -1;
  /** indice (nella linea) della prossima fermata */
  target: number;
  dwell: number;
  passengers: Passenger[];
  /** minuti di gioco di guasto residui */
  brokenFor: number;
}

export type EventKind = 'breakdown' | 'flood' | 'peak' | 'works';

export interface GameEvent {
  id: number;
  kind: EventKind;
  title: string;
  until: number;
  stationId?: number;
  cellId?: number;
  trainId?: number;
}

export type Difficulty = 'off' | 'easy' | 'normal';

export interface Stats {
  delivered: number;
  lost: number;
  incomeToday: number;
  expensesToday: number;
  lastDayIncome: number;
  lastDayExpenses: number;
}

export interface GameState {
  version: number;
  seed: number;
  cityName: string;
  /** minuti di gioco dall'inizio (0 = giorno 1, 00:00) */
  time: number;
  money: number;
  satisfaction: number;
  level: number;
  mapId: 'nyc';
  cells: Cell[];
  stations: Station[];
  lines: Line[];
  trains: Train[];
  events: GameEvent[];
  goalsDone: string[];
  log: { t: number; text: string }[];
  stats: Stats;
  difficulty: Difficulty;
  nextId: number;
}
