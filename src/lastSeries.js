// L'ultima serie in cui si è categorizzato qualcosa (Fase 38): la categorizzazione
// multipla la propone come scelta rapida, perché i file di una stessa serie si
// importano spesso a gruppi. Si ricorda l'id (non il titolo: resiste a una
// rinomina) in locale, sul dispositivo: è una comodità, non un dato della libreria.
const KEY = 'manga-reader:last-categorized-series';

export function loadLastSeriesId() {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastSeriesId(seriesId) {
  try {
    localStorage.setItem(KEY, String(seriesId));
  } catch {
    // Storage pieno o non disponibile: nessun suggerimento la prossima volta.
  }
}
