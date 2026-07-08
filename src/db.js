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

export async function categorizeChapter(chapterId, { seriesId, volumeId }) {
  return db.chapters.update(chapterId, { seriesId, volumeId, categorized: true });
}

export async function getUncategorizedChapters() {
  return db.chapters.filter((chapter) => !chapter.categorized).toArray();
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
