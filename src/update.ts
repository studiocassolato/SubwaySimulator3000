/**
 * Controlla se su GitHub Pages c'è una versione più nuova di quella in esecuzione.
 * La build pubblica version.json con il proprio identificativo: se cambia, c'è un aggiornamento.
 */
const CHECK_EVERY_MS = 5 * 60_000;

export function watchForUpdates(onUpdate: (notes: string[], id: string) => void) {
  let notified = false;
  const check = async () => {
    if (notified) return;
    try {
      const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return; // in sviluppo il file non esiste
      const v = (await res.json()) as { id?: string; notes?: string[] };
      if (v.id && v.id !== __BUILD_ID__) {
        notified = true;
        onUpdate(v.notes ?? [], v.id);
      }
    } catch {
      // offline o file mancante: riproveremo
    }
  };
  setTimeout(check, 15_000);
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

/** true la prima volta che si apre una build nuova su questo browser (non alla primissima visita). */
export function justUpdated(): boolean {
  try {
    const prev = localStorage.getItem('ss3000-build');
    localStorage.setItem('ss3000-build', __BUILD_ID__);
    return !!prev && prev !== __BUILD_ID__;
  } catch {
    return false;
  }
}
