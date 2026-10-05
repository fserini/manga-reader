// Logica pura della lista "Le mie serie" (Fase 34): i filtri, l'ordinamento e il
// filtro ricordato in locale. Un file a sé, senza React, perché lo usano sia la
// card del Profilo sia la pagina completa.
export const LIST_FILTERS = ['fav', 'progress', 'done', 'toread'];
export const LIST_SORTS = ['read', 'recent', 'alpha'];

const FILTER_KEY = 'manga-reader:my-list-filter';
// Il filtro di partenza è "Preferiti" (decisione di Federico).
export const DEFAULT_LIST_FILTER = 'fav';

// Il filtro scelto per ultimo, ricordato da una visita all'altra. Un valore
// sconosciuto o uno storage non disponibile ricadono sul predefinito.
export function loadListFilter() {
  try {
    const stored = localStorage.getItem(FILTER_KEY);
    return LIST_FILTERS.includes(stored) ? stored : DEFAULT_LIST_FILTER;
  } catch {
    return DEFAULT_LIST_FILTER;
  }
}

export function saveListFilter(filter) {
  try {
    localStorage.setItem(FILTER_KEY, filter);
  } catch {
    // Storage pieno o non disponibile: la scelta vale per questa visita.
  }
}

// Un titolo appartiene a un filtro: la stella per "fav", altrimenti il suo stato.
export function matchesFilter(item, filter) {
  return filter === 'fav' ? item.fav : item.state === filter;
}

export function countFor(items, filter) {
  return items.filter((item) => matchesFilter(item, filter)).length;
}

// 'read': ultima lettura (poi i più recenti); 'recent': aggiunti di recente;
// 'alpha': alfabetico, con i numeri "naturali" (Serie 2 prima di Serie 10).
export function sortItems(items, how) {
  const list = items.slice();
  if (how === 'alpha') {
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  } else if (how === 'recent') {
    list.sort((a, b) => b.added - a.added);
  } else {
    list.sort((a, b) => b.last - a.last || b.added - a.added);
  }
  return list;
}

// Come si ordina l'anteprima nella card: ciò che si sta leggendo, per ultima
// lettura; il resto, per data di aggiunta.
export function previewSort(filter) {
  return filter === 'progress' || filter === 'fav' ? 'read' : 'recent';
}
