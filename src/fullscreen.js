// Schermo intero del browser (Fase 36), per il Lettore.
//
// Il tocco al centro della pagina nasconde già i controlli e la barra dell'app,
// ma la striscia di sistema in alto (data e ora di Android) resta: la copre solo
// la Fullscreen API. Funzioni piccole e a prova di errore: il browser può non
// supportarla (iPhone), o rifiutare la richiesta se non arriva da un tocco
// recente, e in nessuno dei due casi la lettura deve rompersi.

export function isFullscreenSupported() {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

export function isFullscreenActive() {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

// Va chiamata poco dopo un tocco dell'utente (la finestra di "attivazione
// transitoria" dura qualche secondo): fuori da lì il browser rifiuta. Il
// rifiuto si ignora.
export async function enterFullscreen() {
  if (!isFullscreenSupported() || isFullscreenActive()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Richiesta rifiutata (nessun gesto recente, o permesso negato): si legge
    // comunque, con la barra di sistema visibile.
  }
}

export async function exitFullscreen() {
  if (!isFullscreenActive()) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Già uscito, o non permesso: nessun effetto.
  }
}
