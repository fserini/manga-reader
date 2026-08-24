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
  return db.volumes.add({ seriesId, number, favorite: false });
}

export async function addChapter({ fileName, number, seriesId = null, volumeId = null }) {
  return db.chapters.add({
    fileName,
    number,
    seriesId,
    volumeId,
    categorized: seriesId != null,
    favorite: false,
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
    favorite: false,
    importedAt: Date.now(),
  });
}

// Il capitolo con quel nome file, se esiste (altrimenti undefined). Usata in
// import sia per bloccare i duplicati sia per riconoscere un capitolo "senza
// handle" (Fase 16: dopo un ripristino da backup) da ricollegare invece di
// scartare. Sfrutta l'indice "fileName" (query diretta nel DB).
export async function getChapterByFileName(fileName) {
  return db.chapters.where('fileName').equals(fileName).first();
}

// Aggiorna solo l'handle di un capitolo già presente: usata per ricollegare
// un capitolo "orfano" (importato da un backup, senza riferimento al file
// fisico) re-importando lo stesso file.
export async function setChapterHandle(chapterId, handle) {
  return db.chapters.update(chapterId, { handle });
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

// Ultima data di lettura per ogni serie (la più recente tra i suoi
// capitoli), come mappa {seriesId: lastReadAt}: usata dal catalogo per
// l'ordinamento "ultimi letti". Le serie mai lette non compaiono nella
// mappa (il chiamante le tratta come "meno recenti di tutte").
export async function getSeriesLastReadMap() {
  const progressRows = await db.readingProgress.toArray();
  const chapters = await db.chapters.bulkGet(progressRows.map((progress) => progress.chapterId));

  const map = {};
  progressRows.forEach((progress, index) => {
    const chapter = chapters[index];
    if (!chapter || chapter.seriesId == null) return;
    if (!map[chapter.seriesId] || progress.lastReadAt > map[chapter.seriesId]) {
      map[chapter.seriesId] = progress.lastReadAt;
    }
  });
  return map;
}

// I volumi di una serie, ordinati per numero: popolano il menu del form una
// volta scelta la serie.
export async function getVolumesForSeries(seriesId) {
  const volumes = await db.volumes.where('seriesId').equals(seriesId).toArray();
  return volumes.sort((a, b) => a.number - b.number);
}

// I capitoli (già categorizzati) di un volume, ordinati per numero: popolano il
// terzo livello della vista Libreria.
export async function getChaptersForVolume(volumeId) {
  const chapters = await db.chapters.where('volumeId').equals(volumeId).toArray();
  return chapters.sort((a, b) => a.number - b.number);
}

export async function getSeries(seriesId) {
  return db.series.get(seriesId);
}

export async function getVolume(volumeId) {
  return db.volumes.get(volumeId);
}

export async function getChapter(chapterId) {
  return db.chapters.get(chapterId);
}

// Salva la miniatura (un Blob) del capitolo, generata dal Lettore la prima
// volta che il file viene letto. La stessa miniatura fa da "copertina" per il
// volume e la serie, ma solo se non ne hanno già una (la prima vince).
export async function setChapterThumbnail(chapterId, thumbnail) {
  const chapter = await db.chapters.get(chapterId);
  if (!chapter) return;

  await db.chapters.update(chapterId, { thumbnail });

  if (chapter.volumeId != null) {
    const volume = await db.volumes.get(chapter.volumeId);
    if (volume && !volume.coverThumbnail) {
      await db.volumes.update(chapter.volumeId, { coverThumbnail: thumbnail });
    }
  }
  if (chapter.seriesId != null) {
    const series = await db.series.get(chapter.seriesId);
    if (series && !series.coverThumbnail) {
      await db.series.update(chapter.seriesId, { coverThumbnail: thumbnail });
    }
  }
}

// Numero totale di capitoli in libreria (categorizzati o no): serve alla
// Libreria per capire se è completamente vuota e mostrare l'invito all'import.
export async function getChapterCount() {
  return db.chapters.count();
}

// --- Rimozione ---
//
// Le funzioni di rimozione lavorano solo sul database (i riferimenti). La
// cancellazione del file fisico è separata (fileAccess.js) e va fatta PRIMA di
// rimuovere il capitolo dal DB, perché ci serve ancora il suo handle.

// Tutti i capitoli sotto una serie o un volume: servono al chiamante per
// raccogliere gli handle prima di un'eventuale cancellazione fisica dei file.
export async function getChaptersUnderSeries(seriesId) {
  return db.chapters.where('seriesId').equals(seriesId).toArray();
}

export async function getChaptersUnderVolume(volumeId) {
  return db.chapters.where('volumeId').equals(volumeId).toArray();
}

export async function removeChapter(chapterId) {
  await db.readingProgress.delete(chapterId);
  await db.chapters.delete(chapterId);
}

export async function removeVolume(volumeId) {
  const chapters = await db.chapters.where('volumeId').equals(volumeId).toArray();
  await db.readingProgress.bulkDelete(chapters.map((chapter) => chapter.id));
  await db.chapters.where('volumeId').equals(volumeId).delete();
  await db.volumes.delete(volumeId);
}

export async function removeSeries(seriesId) {
  const chapters = await db.chapters.where('seriesId').equals(seriesId).toArray();
  await db.readingProgress.bulkDelete(chapters.map((chapter) => chapter.id));
  await db.chapters.where('seriesId').equals(seriesId).delete();
  await db.volumes.where('seriesId').equals(seriesId).delete();
  await db.series.delete(seriesId);
}

// --- Preferiti ---
//
// Un "vero" toggle: legge lo stato attuale e lo inverte, così chi chiama non
// deve tenere traccia del valore corrente. Un livello per tabella, stesso
// schema per tutte e tre.

export async function toggleSeriesFavorite(seriesId) {
  const series = await db.series.get(seriesId);
  if (!series) return;
  await db.series.update(seriesId, { favorite: !series.favorite });
}

export async function toggleVolumeFavorite(volumeId) {
  const volume = await db.volumes.get(volumeId);
  if (!volume) return;
  await db.volumes.update(volumeId, { favorite: !volume.favorite });
}

export async function toggleChapterFavorite(chapterId) {
  const chapter = await db.chapters.get(chapterId);
  if (!chapter) return;
  await db.chapters.update(chapterId, { favorite: !chapter.favorite });
}

export async function getFavoriteSeries() {
  const series = await db.series.filter((item) => Boolean(item.favorite)).toArray();
  return series.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
}

// Volumi preferiti, arricchiti col titolo della loro serie (altrimenti "Volume
// 3" da solo non direbbe di quale manga si tratta).
export async function getFavoriteVolumes() {
  const volumes = await db.volumes.filter((item) => Boolean(item.favorite)).toArray();
  return Promise.all(
    volumes.map(async (volume) => {
      const series = volume.seriesId != null ? await db.series.get(volume.seriesId) : null;
      return { ...volume, seriesTitle: series?.title ?? null };
    }),
  );
}

export async function getFavoriteChapters() {
  const chapters = await db.chapters.filter((item) => Boolean(item.favorite)).toArray();
  const enriched = await Promise.all(chapters.map((chapter) => enrichChapter(chapter)));
  return enriched.filter(Boolean);
}

export async function getReadingProgress(chapterId) {
  return db.readingProgress.get(chapterId);
}

// Aggiorna il progresso di lettura fondendo i campi esistenti: usiamo un
// read-modify-write invece di un put "secco" perché altrimenti sovrascriveremmo
// (cancellandolo) il segnalibro manuale a ogni cambio pagina.
export async function updateReadingProgress(chapterId, { lastPageRead, totalPages }) {
  const existing = await db.readingProgress.get(chapterId);
  return db.readingProgress.put({
    ...existing,
    chapterId,
    lastPageRead,
    totalPages,
    lastReadAt: Date.now(),
  });
}

// Imposta (o cancella, con page null) il segnalibro manuale, preservando il
// resto del progresso.
export async function setManualBookmark(chapterId, page) {
  const existing = await db.readingProgress.get(chapterId);
  return db.readingProgress.put({
    chapterId,
    lastPageRead: existing?.lastPageRead ?? page ?? 0,
    totalPages: existing?.totalPages ?? 0,
    lastReadAt: existing?.lastReadAt ?? Date.now(),
    ...existing,
    manualBookmarkPage: page,
  });
}

// Progresso di lettura per un insieme di capitoli, come mappa {id: progresso}:
// serve al catalogo per mostrare l'indicatore di completamento.
export async function getReadingProgressMap(chapterIds) {
  const rows = await db.readingProgress.bulkGet(chapterIds);
  const map = {};
  rows.forEach((row) => {
    if (row) map[row.chapterId] = row;
  });
  return map;
}

// Arricchisce un capitolo con titolo della serie e numero di volume: usata
// ovunque serve mostrare un capitolo "fuori contesto" (fuori dal catalogo
// gerarchico), come nelle sezioni di lettura e nei preferiti. Restituisce
// null se il capitolo non esiste più (riferimento nel frattempo rimosso).
async function enrichChapter(chapter, extra = {}) {
  if (!chapter) return null;
  const [series, volume] = await Promise.all([
    chapter.seriesId != null ? db.series.get(chapter.seriesId) : null,
    chapter.volumeId != null ? db.volumes.get(chapter.volumeId) : null,
  ]);
  return {
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    seriesTitle: series?.title ?? null,
    volumeNumber: volume?.number ?? null,
    thumbnail: chapter.thumbnail ?? null,
    handle: chapter.handle ?? null,
    favorite: Boolean(chapter.favorite),
    ...extra,
  };
}

// Arricchisce le righe di progresso, per mostrarle nelle sezioni "in corso" e
// "ultimi letti" della Libreria. Salta i progressi il cui capitolo non esiste
// più.
async function enrichProgressRows(rows) {
  const items = await Promise.all(
    rows.map(async (progress) => {
      const chapter = await db.chapters.get(progress.chapterId);
      return enrichChapter(chapter, {
        lastPageRead: progress.lastPageRead,
        totalPages: progress.totalPages,
      });
    }),
  );
  return items.filter(Boolean);
}

export async function getRecentlyReadChapters(limit = 10) {
  const rows = await db.readingProgress.orderBy('lastReadAt').reverse().limit(limit).toArray();
  return enrichProgressRows(rows);
}

// "In corso" = letti di recente ma non ancora completati (ultima pagina letta
// prima dell'ultima pagina del capitolo).
export async function getInProgressChapters(limit = 10) {
  const rows = await db.readingProgress.orderBy('lastReadAt').reverse().toArray();
  const inProgress = rows
    .filter((progress) => progress.totalPages > 0 && progress.lastPageRead < progress.totalPages - 1)
    .slice(0, limit);
  return enrichProgressRows(inProgress);
}

// --- Backup e ripristino ---
//
// JSON non sa rappresentare i Blob delle miniature: le convertiamo in data
// URL (stringhe) per l'esportazione, e viceversa al ripristino.
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

// Esporta l'intera libreria (serie, volumi, capitoli, progressi) in un
// oggetto pronto per essere salvato come file JSON. L'handle dei capitoli
// NON viene esportato: è un FileSystemFileHandle legato a un file preciso di
// QUESTO browser/dispositivo, non ha alcun significato altrove — dopo un
// ripristino i capitoli vanno ricollegati re-importando gli stessi file
// (vedi getChapterByFileName/setChapterHandle, usate in Library.jsx).
export async function exportBackup() {
  const [seriesRows, volumeRows, chapterRows, progressRows] = await Promise.all([
    db.series.toArray(),
    db.volumes.toArray(),
    db.chapters.toArray(),
    db.readingProgress.toArray(),
  ]);

  const series = await Promise.all(
    seriesRows.map(async (row) => ({
      ...row,
      coverThumbnail: row.coverThumbnail ? await blobToDataUrl(row.coverThumbnail) : null,
    })),
  );
  const volumes = await Promise.all(
    volumeRows.map(async (row) => ({
      ...row,
      coverThumbnail: row.coverThumbnail ? await blobToDataUrl(row.coverThumbnail) : null,
    })),
  );
  const chapters = await Promise.all(
    // eslint-disable-next-line no-unused-vars -- si estrae "handle" apposta per escluderlo dal risultato
    chapterRows.map(async ({ handle, ...row }) => ({
      ...row,
      thumbnail: row.thumbnail ? await blobToDataUrl(row.thumbnail) : null,
    })),
  );

  return {
    version: 1,
    exportedAt: Date.now(),
    series,
    volumes,
    chapters,
    readingProgress: progressRows,
  };
}

// Sostituisce l'intera libreria con quella contenuta in un backup prodotto da
// exportBackup: cancella le tabelle e le ripopola dentro un'unica
// transazione (o va tutto a buon fine, o — in caso di errore a metà — non
// resta una libreria a metà ripristinata). Gli id originali vengono
// preservati (bulkAdd con chiave esplicita), così i collegamenti
// serie/volume/capitolo/progresso restano coerenti.
export async function restoreBackup(backup) {
  const series = await Promise.all(
    (backup.series ?? []).map(async ({ coverThumbnail, ...row }) => ({
      ...row,
      ...(coverThumbnail ? { coverThumbnail: await dataUrlToBlob(coverThumbnail) } : {}),
    })),
  );
  const volumes = await Promise.all(
    (backup.volumes ?? []).map(async ({ coverThumbnail, ...row }) => ({
      ...row,
      ...(coverThumbnail ? { coverThumbnail: await dataUrlToBlob(coverThumbnail) } : {}),
    })),
  );
  const chapters = await Promise.all(
    (backup.chapters ?? []).map(async ({ thumbnail, ...row }) => ({
      ...row,
      ...(thumbnail ? { thumbnail: await dataUrlToBlob(thumbnail) } : {}),
    })),
  );

  await db.transaction('rw', db.series, db.volumes, db.chapters, db.readingProgress, async () => {
    await Promise.all([
      db.series.clear(),
      db.volumes.clear(),
      db.chapters.clear(),
      db.readingProgress.clear(),
    ]);
    await Promise.all([
      db.series.bulkAdd(series),
      db.volumes.bulkAdd(volumes),
      db.chapters.bulkAdd(chapters),
      db.readingProgress.bulkAdd(backup.readingProgress ?? []),
    ]);
  });
}
