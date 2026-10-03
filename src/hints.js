// Suggerimenti che si mostrano una volta e si possono chiudere (Fase 26):
// ricordati in locale, per nome. Come le altre preferenze dell'interfaccia, lo
// storage può mancare o essere pieno: in quel caso il suggerimento si
// ripresenta, non è un errore.
const KEY_PREFIX = 'manga-reader:hint-dismissed:';

export function isHintDismissed(name) {
  try {
    return localStorage.getItem(KEY_PREFIX + name) === '1';
  } catch {
    return false;
  }
}

export function dismissHint(name) {
  try {
    localStorage.setItem(KEY_PREFIX + name, '1');
  } catch {
    // Non salvato: il suggerimento tornerà alla prossima visita.
  }
}
