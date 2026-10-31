import { CASTELFRANCO } from './castelfranco';
import { NYC } from './nyc';
import type { MapId, Vec, ZoneType } from './types';

/** Un'area di terraferma: dà il nome al distretto (usato nel pannello e nell'obiettivo dei 3 distretti). */
export interface LandMass {
  name: string;
  /** dove scrivere il nome sulla mappa (assente = nessuna scritta) */
  label?: Vec;
  poly: Vec[];
}

/** Specchio d'acqua disegnato sopra la terraferma, con eventuali isole al suo interno. */
export interface WaterBody {
  poly: Vec[];
  holes?: Vec[][];
}

/** Quartieri: danno il nome alle stazioni e il tipo di zona agli isolati vicini. */
export interface Seed {
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  r: number;
}

export interface MapDef {
  id: MapId;
  city: string;
  icon: string;
  /** frase breve per il menu */
  blurb: string;
  width: number;
  height: number;
  /** distretti di terraferma; il primo che contiene un punto vince */
  land: LandMass[];
  /** se presente si disegna questo al posto dei poligoni dei distretti (che possono sovrapporsi) */
  ground?: Vec[];
  water: WaterBody[];
  waterLabels: { name: string; at: Vec; angle: number; size?: number }[];
  /** scritte di zona in più, oltre a quelle dei distretti */
  extraLabels: { name: string; at: Vec }[];
  /** parchi: isolati sempre a verde */
  parks: Vec[][];
  /** mura da disegnare (per il castello) */
  walls?: Vec[];
  /** ferrovie decorative */
  rails?: Vec[][];
  seeds: Seed[];
  /** centri d'affari: la densità iniziale cala allontanandosi da qui */
  cores: Vec[];
  /** distretto sempre denso (Manhattan, il centro storico) */
  denseArea: string;
  /** dove guarda la telecamera a inizio partita, e quanta mappa mostra */
  focus: Vec;
  focusSize: { w: number; h: number };
  welcome: string;
}

export const MAPS: Record<MapId, MapDef> = { nyc: NYC, castelfranco: CASTELFRANCO };
export const MAP_LIST: MapDef[] = [NYC, CASTELFRANCO];

/** Mappa attiva: cambia quando si inizia o si carica una partita. */
export let MAP: MapDef = NYC;

export function setMap(id: MapId | undefined) {
  MAP = MAPS[id ?? 'nyc'] ?? NYC;
}

export function pointInPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function landAt(p: Vec): LandMass | null {
  for (const w of MAP.water) {
    if (pointInPoly(p, w.poly) && !(w.holes ?? []).some((h) => pointInPoly(p, h))) return null;
  }
  for (const l of MAP.land) if (pointInPoly(p, l.poly)) return l;
  return null;
}

/** Tratti d'acqua attraversati da un segmento: ogni tratto è una galleria. */
export function waterCrossings(a: Vec, b: Vec): Vec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(len / 12));
  const out: Vec[] = [];
  let wasLand = true;
  let start = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const land = landAt(p) !== null;
    if (!land && wasLand) start = t;
    if (land && !wasLand) {
      const mid = (start + t) / 2;
      // ignora i tratti minuscoli (spigoli dei poligoni)
      if ((t - start) * len > 20) out.push({ x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid });
    }
    wasLand = land;
  }
  return out;
}
