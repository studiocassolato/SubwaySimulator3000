export type ZoneType =
  | 'residential'
  | 'industrial'
  | 'offices'
  | 'food'
  | 'hospital'
  | 'school'
  | 'leisure';

export type MapId = 'nyc' | 'castelfranco';

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
  /** minuto in cui la stazione è stata collegata per la prima volta */
  openedAt?: number;
  /** minuti accumulati di sovraffollamento (crisi a OVERCROWD_LIMIT) */
  crowd: number;
  /** malcontento 0-100 dei residenti finché la stazione non è collegata */
  discontent: number;
  /** fino a quando la crescita del quartiere è bloccata dopo una crisi */
  frozenUntil?: number;
}

export interface MayorRequest {
  id: number;
  kind: 'connect' | 'deliver';
  title: string;
  stationId?: number;
  zone?: ZoneType;
  target: number;
  progress: number;
  deadline: number;
  reward: number;
  rep: number;
}

export interface Line {
  id: number;
  color: string;
  name: string;
  stations: number[];
  /** linea presa in gestione dal Comune: il giocatore non la usa né la modifica finché non la riscatta */
  seized?: boolean;
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
  /** minuti già trattenuti in stazione per regolare la distanza (assente se in viaggio) */
  held?: number;
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
  /** fiducia del sindaco 0-100: decide i contributi giornalieri */
  reputation: number;
  level: number;
  mapId: MapId;
  cells: Cell[];
  stations: Station[];
  lines: Line[];
  trains: Train[];
  events: GameEvent[];
  requests: MayorRequest[];
  /** prossimo sito (indice in SITE_ORDER) che il sindaco approverà */
  nextSite: number;
  /** donazioni al Comune fatte oggi (il prezzo cresce a ogni donazione) */
  donationsToday?: number;
  goalsDone: string[];
  log: { t: number; text: string }[];
  stats: Stats;
  difficulty: Difficulty;
  nextId: number;
}
