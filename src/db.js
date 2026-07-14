import Dexie from 'dexie';

export const db = new Dexie('MangaReaderDB');

// Serie -> Volumi -> Capitoli. I capitoli importati ma non ancora assegnati
// a una serie/volume restano con seriesId/volumeId nulli e categorized: false
// (sezione "Da categorizzare", Fase 8/9). readingProgress è collegata 1:1 a
// un capitolo tramite chapterId come chiave primaria.
//
// "favorite" e "categorized" sono booleani e non compaiono negli indici: un
// booleano non è un tipo di chiave valido per IndexedDB (accetta solo
// numeri, stringhe, Date e array) — quei campi si filtrano lato JS dopo la
// lettura, invece di usare una query indicizzata.
db.version(1).stores({
  series: '++id',
  volumes: '++id, seriesId',
  chapters: '++id, seriesId, volumeId, importedAt',
  readingProgress: 'chapterId, lastReadAt',
});

// Versione 2 (Fase 8): la riga capitolo conserva anche "handle", un
// FileSystemFileHandle che punta al file CBZ/CBR originale sul dispositivo
// (l'app resta un "visore" sui file dell'utente, non ne duplica i byte).
// L'handle è serializzabile via structured clone, quindi IndexedDB lo salva
// nativamente; non è indicizzato perché non ci si cerca sopra.
// Nuovo indice "fileName": serve per bloccare velocemente i duplicati in
// import (una query indicizzata invece di leggere e filtrare tutte le righe).
// Dexie ri-indicizza da solo le righe già presenti durante l'upgrade: non
// serve una funzione di migrazione dei dati.
db.version(2).stores({
  series: '++id',
  volumes: '++id, seriesId',
  chapters: '++id, seriesId, volumeId, importedAt, fileName',
  readingProgress: 'chapterId, lastReadAt',
});

export async function addSeries(title) {
  return db.series.add({ title, favorite: false });
}

export async function addVolume(seriesId, number) {
  return db.volumes.add({ seriesId, number });
}

export async function addChapter({ fileName, number, seriesId = null, volumeId = null }) {
  return db.chapters.add({
    fileName,
    number,
    seriesId,
    volumeId,
    categorized: seriesId != null,
    importedAt: Date.now(),
  });
}

// Aggiunge un capitolo appena importato, ancora "da categorizzare": non ha
// serie/volume/numero (verranno assegnati in Fase 9). Conserva il fileName
// (per il rilevamento duplicati) e l'handle al file fisico (per riaprirlo poi
// dal Lettore, anche dopo un reload, senza doverlo re-importare).
export async function importChapter({ fileName, handle }) {
  return db.chapters.add({
    fileName,
    handle,
    number: null,
    seriesId: null,
    volumeId: null,
    categorized: false,
    importedAt: Date.now(),
  });
}

// True se esiste già un capitolo con quel nome file: usato in import per
// bloccare i duplicati. Sfrutta l'indice "fileName" (query diretta nel DB).
export async function chapterExistsByFileName(fileName) {
  const count = await db.chapters.where('fileName').equals(fileName).count();
  return count > 0;
}

export async function categorizeChapter(chapterId, { seriesId, volumeId, number }) {
  return db.chapters.update(chapterId, { seriesId, volumeId, number, categorized: true });
}

export async function getUncategorizedChapters() {
  return db.chapters.filter((chapter) => !chapter.categorized).toArray();
}

// Tutte le serie, in ordine alfabetico: popolano il menu a tendina del form di
// categorizzazione (dove l'utente sceglie una serie esistente o ne crea una).
export async function getAllSeries() {
  const series = await db.series.toArray();
  return series.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

// I volumi di una serie, ordinati per numero: popolano il menu del form una
// volta scelta la serie.
export async function getVolumesForSeries(seriesId) {
  const volumes = await db.volumes.where('seriesId').equals(seriesId).toArray();
  return volumes.sort((a, b) => a.number - b.number);
}

// Numero totale di capitoli in libreria (categorizzati o no): serve alla
// Libreria per capire se è completamente vuota e mostrare l'invito all'import.
export async function getChapterCount() {
  return db.chapters.count();
}

export async function toggleFavorite(seriesId, favorite) {
  return db.series.update(seriesId, { favorite });
}

export async function updateReadingProgress(chapterId, { lastPageRead, totalPages }) {
  return db.readingProgress.put({
    chapterId,
    lastPageRead,
    totalPages,
    lastReadAt: Date.now(),
  });
}

export async function setManualBookmark(chapterId, page) {
  return db.readingProgress.update(chapterId, { manualBookmarkPage: page });
}

export async function getRecentlyRead(limit = 10) {
  return db.readingProgress.orderBy('lastReadAt').reverse().limit(limit).toArray();
}

export async function getInProgress(limit = 10) {
  const recent = await db.readingProgress.orderBy('lastReadAt').reverse().toArray();
  return recent.filter((progress) => progress.lastPageRead < progress.totalPages - 1).slice(0, limit);
}
