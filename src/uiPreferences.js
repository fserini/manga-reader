// Preferenze di aspetto dell'interfaccia, salvate in locale sul dispositivo
// (Fase 29, ADR-002): quale marchio mostrare, che tipo di menu usare e da
// quale pagina partire. Vive in un file a sé, non nel Context, perché ESLint
// (react-refresh) non vuole costanti e funzioni esportate accanto a un
// componente.
const STORAGE_KEY = 'manga-reader:ui-prefs';

export const LOGO_OPTIONS = ['sigillo', 'dorso', 'blueline'];
export const MENU_OPTIONS = ['icons', 'pop', 'drawer'];
// 'auto': il Lettore se c'è già qualcosa da continuare, altrimenti la Libreria.
export const START_PAGE_OPTIONS = ['auto', 'library', 'reader'];

export const DEFAULT_PREFS = { logo: 'sigillo', menu: 'icons', startPage: 'auto' };

// Un valore sconosciuto o rovinato (storage manomesso, opzione rimossa in
// futuro) ricade sul predefinito, invece di rompere la barra. Chi aveva già
// salvato marchio e menu prima che esistesse la pagina iniziale ottiene
// semplicemente il predefinito per quella.
export function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      logo: LOGO_OPTIONS.includes(stored?.logo) ? stored.logo : DEFAULT_PREFS.logo,
      menu: MENU_OPTIONS.includes(stored?.menu) ? stored.menu : DEFAULT_PREFS.menu,
      startPage: START_PAGE_OPTIONS.includes(stored?.startPage) ? stored.startPage : DEFAULT_PREFS.startPage,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage pieno o non disponibile: la scelta vale per questa sessione ma
    // non resta, non è un errore bloccante.
  }
}
