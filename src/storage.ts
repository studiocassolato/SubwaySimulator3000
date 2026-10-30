import type { GameState } from './types';
import { SAVE_VERSION } from './world';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveRecord {
  slot: SlotId;
  savedAt: number;
  summary: string;
  state: GameState;
}

const DB = 'subwaysimulator3000';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slot' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function summarize(s: GameState): string {
  const day = Math.floor(s.time / 1440) + 1;
  return `${s.cityName} · giorno ${day} · ${s.lines.length} linee · $${Math.round(s.money)}`;
}

export async function save(slot: SlotId, state: GameState) {
  const rec: SaveRecord = { slot, savedAt: Date.now(), summary: summarize(state), state: structuredClone(state) };
  await tx('readwrite', (s) => s.put(rec));
}

export async function load(slot: SlotId): Promise<SaveRecord | undefined> {
  return tx('readonly', (s) => s.get(slot) as IDBRequest<SaveRecord | undefined>);
}

export async function list(): Promise<SaveRecord[]> {
  return tx('readonly', (s) => s.getAll() as IDBRequest<SaveRecord[]>);
}

export function exportFile(state: GameState) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  const day = Math.floor(state.time / 1440) + 1;
  a.href = URL.createObjectURL(blob);
  a.download = `subway3000-${state.cityName.replace(/\s+/g, '-').toLowerCase()}-giorno${day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file: File): Promise<GameState> {
  const data = JSON.parse(await file.text()) as GameState;
  if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.cells) || !Array.isArray(data.lines)) {
    throw new Error('File di salvataggio non valido');
  }
  return data;
}
