import Dexie from 'dexie';
import { normalizeTitle } from './chapterNameParser.js';

export const db = new Dexie('MangaReaderDB');

// Serie -> Volumi -> Capitoli. I capitoli importati ma non ancora assegnati
// a una serie/volume restano con seriesId/volumeId nulli e categorized: 0
// (sezione "Da categorizzare", Fase 8/9). readingProgress è collegata 1:1 a
// un capitolo tramite chapterId come chiave primaria.
//
// Nelle prime due versioni "favorite" e "categorized" erano booleani e non
// comparivano negli indici: un booleano non è un tipo di chiave valido per
// IndexedDB (accetta solo numeri, stringhe, Date e array), quindi quei campi
// si filtravano lato JS dopo aver letto ogni riga. Dalla versione 3 sono
// numeri 0/1 indicizzati (vedi più sotto).
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

// Versione 3 (Fase 30a, prestazioni con librerie grandi). Tre cambiamenti che
// nascono dalle misure fatte su 1.500 e 9.000 capitoli:
//
// 1. Le miniature escono dalla riga del capitolo e vanno in una tabella a
//    parte, `thumbnails` ({ chapterId, blob }). Ogni scansione della tabella
//    `chapters` caricava, insieme a ogni riga, il suo Blob di ~15 KB: ora le
//    righe sono piccole e le miniature si leggono solo per i capitoli che si
//    mostrano davvero.
// 2. `categorized` e `favorite` diventano 0/1 e hanno un indice. Un booleano
//    non è una chiave valida per IndexedDB, quindi "i capitoli da
//    categorizzare" e "i preferiti" si ottenevano leggendo TUTTE le righe e
//    filtrando in JS; un numero si può indicizzare, e where('favorite')
//    .equals(1) legge solo le righe che servono. Chi legge questi campi come
//    "vero/falso" (Boolean(chapter.favorite)) continua a funzionare: 0/1 si
//    comportano da falso/vero.
// 3. Ogni serie ricorda la data dell'ultima lettura (`lastReadAt`), che il
//    Catalogo usa per l'ordinamento "ultimi letti": prima la si ricavava ad
//    ogni apertura leggendo tutti i progressi e i capitoli collegati.
//
// La migrazione gira una sola volta, al primo avvio dopo l'aggiornamento, e
// riscrive le righe dei capitoli: con migliaia di capitoli può richiedere
// qualche secondo.
const MIGRATION_CHUNK = 500;

// La data di ultima lettura di ogni serie (la più recente tra i suoi
// capitoli), come mappa {seriesId: lastReadAt}. Funzione pura: la usano sia la
// migrazione sia il ripristino di un backup, che non conosce questo campo.
function computeSeriesLastRead(chapters, progressRows) {
  const seriesByChapter = new Map(chapters.map((chapter) => [chapter.id, chapter.seriesId]));
  const map = new Map();
  progressRows.forEach((progress) => {
    const seriesId = seriesByChapter.get(progress.chapterId);
    if (seriesId == null) return;
    if (!map.has(seriesId) || progress.lastReadAt > map.get(seriesId)) map.set(seriesId, progress.lastReadAt);
  });
  return map;
}

db.version(3)
  .stores({
    series: '++id',
    volumes: '++id, seriesId',
    chapters: '++id, seriesId, volumeId, importedAt, fileName, categorized, favorite',
    readingProgress: 'chapterId, lastReadAt',
    thumbnails: 'chapterId',
  })
  .upgrade(async (tx) => {
    const chapters = await tx.table('chapters').toArray();

    // Miniature in tabella a parte, flag booleani → 0/1: un blocco alla volta,
    // per non tenere in coda migliaia di scritture insieme.
    for (let start = 0; start < chapters.length; start += MIGRATION_CHUNK) {
      const chunk = chapters.slice(start, start + MIGRATION_CHUNK);
      const thumbnails = chunk
        .filter((chapter) => chapter.thumbnail)
        .map((chapter) => ({ chapterId: chapter.id, blob: chapter.thumbnail }));
      // eslint-disable-next-line no-unused-vars -- si estrae "thumbnail" apposta per escluderlo dalla riga
      const rows = chunk.map(({ thumbnail, ...row }) => ({
        ...row,
        categorized: row.categorized ? 1 : 0,
        favorite: row.favorite ? 1 : 0,
      }));
      if (thumbnails.length > 0) await tx.table('thumbnails').bulkPut(thumbnails);
      await tx.table('chapters').bulkPut(rows);
    }

    const lastRead = computeSeriesLastRead(chapters, await tx.table('readingProgress').toArray());
    if (lastRead.size > 0) {
      await tx
        .table('series')
        .toCollection()
        .modify((series) => {
          if (lastRead.has(series.id)) series.lastReadAt = lastRead.get(series.id);
        });
    }
  });

// Dà alle righe dei capitoli la loro miniatura (campo `thumbnail`, come prima
// della v3), leggendola dalla tabella a parte. Si usa solo dove le miniature
// servono davvero: la griglia dei capitoli di un volume, la scelta della
// copertina, i capitoli "arricchiti" delle sezioni di lettura.
async function withThumbnails(chapters) {
  if (chapters.length === 0) return chapters;
  const rows = await db.thumbnails.bulkGet(chapters.map((chapter) => chapter.id));
  return chapters.map((chapter, index) => (rows[index] ? { ...chapter, thumbnail: rows[index].blob } : chapter));
}

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
    categorized: seriesId != null ? 1 : 0,
    favorite: 0,
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
    categorized: 0,
    favorite: 0,
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
  return db.chapters.update(chapterId, { seriesId, volumeId, number, categorized: 1 });
}

// Categorizza più capitoli in un colpo solo (Fase 23), in un'unica transazione:
// o va tutto a buon fine, o non cambia niente (niente serie create a metà).
// La serie è una esistente (seriesId) oppure da creare (newSeriesTitle). Il
// volume di ogni capitolo si indica per NUMERO: se la serie ha già quel volume
// lo si usa, altrimenti lo si crea una volta sola, anche se più capitoli lo
// condividono. assignments: [{ chapterId, volumeNumber, number }].
export async function categorizeChaptersBatch({ seriesId = null, newSeriesTitle = null, assignments }) {
  return db.transaction('rw', [db.series, db.volumes, db.chapters], async () => {
    const targetSeriesId = seriesId ?? (await db.series.add({ title: newSeriesTitle, favorite: false }));
    const existingVolumes = seriesId != null ? await db.volumes.where('seriesId').equals(seriesId).toArray() : [];
    const volumeIdByNumber = new Map(existingVolumes.map((volume) => [volume.number, volume.id]));

    for (const { chapterId, volumeNumber, number } of assignments) {
      let volumeId = volumeIdByNumber.get(volumeNumber);
      if (volumeId === undefined) {
        volumeId = await db.volumes.add({ seriesId: targetSeriesId, number: volumeNumber, favorite: false });
        volumeIdByNumber.set(volumeNumber, volumeId);
      }
      await db.chapters.update(chapterId, { seriesId: targetSeriesId, volumeId, number, categorized: 1 });
    }
    return targetSeriesId;
  });
}

// I capitoli da categorizzare, con la query indicizzata: legge solo quelli.
export async function getUncategorizedChapters() {
  return db.chapters.where('categorized').equals(0).toArray();
}

// Solo quanti sono: alla Libreria serve il numero per la card "Da
// categorizzare", non le righe — il conteggio sull'indice non legge nulla.
export async function getUncategorizedCount() {
  return db.chapters.where('categorized').equals(0).count();
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

// I capitoli (già categorizzati) di un volume, ordinati per numero: popolano il
// terzo livello della vista Libreria.
export async function getChaptersForVolume(volumeId) {
  const chapters = await db.chapters.where('volumeId').equals(volumeId).toArray();
  return withThumbnails(chapters.sort((a, b) => a.number - b.number));
}

// Il capitolo che segue quello indicato, per numero, nello stesso volume — o
// null se non esiste (ultimo del volume, o capitolo non categorizzato).
// Usata dal Lettore per l'invito "Capitolo successivo" a fine lettura (Fase 24).
export async function getNextChapterInVolume(chapterId) {
  const chapter = await db.chapters.get(chapterId);
  if (!chapter || chapter.volumeId == null) return null;

  const siblings = await getChaptersForVolume(chapter.volumeId);
  const index = siblings.findIndex((sibling) => sibling.id === chapterId);
  if (index === -1 || index === siblings.length - 1) return null;
  return siblings[index + 1];
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

  await db.thumbnails.put({ chapterId, blob: thumbnail });

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
// raccogliere gli handle prima di un'eventuale cancellazione fisica dei file, e
// alla scelta della copertina (che ha bisogno delle miniature). Le versioni
// "raw" sono per uso interno: niente miniature, quando non servono.
const rawChaptersUnderSeries = (seriesId) => db.chapters.where('seriesId').equals(seriesId).toArray();
const rawChaptersUnderVolume = (volumeId) => db.chapters.where('volumeId').equals(volumeId).toArray();

export async function getChaptersUnderSeries(seriesId) {
  return withThumbnails(await rawChaptersUnderSeries(seriesId));
}

export async function getChaptersUnderVolume(volumeId) {
  return withThumbnails(await rawChaptersUnderVolume(volumeId));
}

// Tutti i capitoli, con il loro handle: per il ricontrollo dei file (Fase 26).
export async function getChaptersForFileCheck() {
  return db.chapters.toArray();
}

// Toglie più capitoli in una volta (progresso e miniature compresi), in
// un'unica transazione. Solo i riferimenti: i file non si toccano.
export async function removeChapters(chapterIds) {
  return db.transaction('rw', [db.chapters, db.readingProgress, db.thumbnails], async () => {
    await db.readingProgress.bulkDelete(chapterIds);
    await db.thumbnails.bulkDelete(chapterIds);
    await db.chapters.bulkDelete(chapterIds);
  });
}

export async function removeChapter(chapterId) {
  await db.readingProgress.delete(chapterId);
  await db.thumbnails.delete(chapterId);
  await db.chapters.delete(chapterId);
}

export async function removeVolume(volumeId) {
  const chapters = await rawChaptersUnderVolume(volumeId);
  const ids = chapters.map((chapter) => chapter.id);
  await db.readingProgress.bulkDelete(ids);
  await db.thumbnails.bulkDelete(ids);
  await db.chapters.where('volumeId').equals(volumeId).delete();
  await db.volumes.delete(volumeId);
}

export async function removeSeries(seriesId) {
  const chapters = await rawChaptersUnderSeries(seriesId);
  const ids = chapters.map((chapter) => chapter.id);
  await db.readingProgress.bulkDelete(ids);
  await db.thumbnails.bulkDelete(ids);
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
  await db.chapters.update(chapterId, { favorite: chapter.favorite ? 0 : 1 });
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
  const chapters = await db.chapters.where('favorite').equals(1).toArray();
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
  const now = Date.now();
  const existing = await db.readingProgress.get(chapterId);
  await db.readingProgress.put({
    ...existing,
    chapterId,
    lastPageRead,
    totalPages,
    lastReadAt: now,
  });
  await touchSeriesLastRead(chapterId, now);
}

// Aggiorna la data di ultima lettura della serie del capitolo (vedi v3).
// Questa funzione gira a ogni cambio pagina, quindi la scrittura è
// "diluita": se la serie risulta già letta nell'ultimo minuto non si riscrive
// la sua riga — che porta con sé il Blob della copertina — a ogni pagina.
const SERIES_LAST_READ_THROTTLE_MS = 60_000;

async function touchSeriesLastRead(chapterId, now) {
  const chapter = await db.chapters.get(chapterId);
  if (chapter?.seriesId == null) return;
  const series = await db.series.get(chapter.seriesId);
  if (!series) return;
  if (series.lastReadAt && now - series.lastReadAt < SERIES_LAST_READ_THROTTLE_MS) return;
  await db.series.update(chapter.seriesId, { lastReadAt: now });
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
  const [series, volume, thumbnail] = await Promise.all([
    chapter.seriesId != null ? db.series.get(chapter.seriesId) : null,
    chapter.volumeId != null ? db.volumes.get(chapter.volumeId) : null,
    db.thumbnails.get(chapter.id),
  ]);
  return {
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    fileName: chapter.fileName ?? null,
    seriesTitle: series?.title ?? null,
    volumeNumber: volume?.number ?? null,
    thumbnail: thumbnail?.blob ?? null,
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
//
// Si scorrono i progressi dal più recente a blocchi e ci si ferma appena si è
// raggiunto il limite: prima si leggevano TUTTI i progressi e tutti i
// capitoli collegati ad ogni apertura, per poi tenerne dieci. Il filtro
// "non completato" sta nella query (è sul progresso stesso); quello "non
// segnato come letto" richiede il capitolo, quindi si fa dopo, blocco per blocco.
const IN_PROGRESS_BATCH = 40;

export async function getInProgressChapters(limit = 10) {
  const found = [];
  let offset = 0;

  while (found.length < limit) {
    const rows = await db.readingProgress
      .orderBy('lastReadAt')
      .reverse()
      .filter((progress) => progress.totalPages > 0 && progress.lastPageRead < progress.totalPages - 1)
      .offset(offset)
      .limit(IN_PROGRESS_BATCH)
      .toArray();
    if (rows.length === 0) break;

    // Un capitolo segnato manualmente come letto (Fase 25) non è "in corso",
    // anche se il suo progresso reale dice il contrario.
    const chapters = await db.chapters.bulkGet(rows.map((progress) => progress.chapterId));
    rows.forEach((progress, index) => {
      const chapter = chapters[index];
      if (chapter && !chapter.markedRead && found.length < limit) found.push(progress);
    });

    if (rows.length < IN_PROGRESS_BATCH) break;
    offset += rows.length;
  }

  return enrichProgressRows(found);
}

// --- Organizzazione e scoperta (Fase 25) ---

// Tag liberi su una serie: un array di stringhe già normalizzate dal chiamante.
export async function setSeriesTags(seriesId, tags) {
  return db.series.update(seriesId, { tags });
}

// Copertina scelta dall'utente per una serie o un volume. Si salva nello
// stesso campo coverThumbnail usato dalla copertina automatica (così Preferiti
// e backup la gestiscono già), più il flag coverCustom: è quello che decide se
// il Catalogo la mostra — Serie e Volumi restano testuali finché l'utente non
// ne sceglie una apposta (vedi Fase 22).
function tableForKind(kind) {
  return kind === 'series' ? db.series : db.volumes;
}

export async function setCustomCover(kind, id, thumbnail) {
  return tableForKind(kind).update(id, { coverThumbnail: thumbnail, coverCustom: true });
}

// Torna alla copertina automatica: la miniatura del primo capitolo (per
// numero) che ne ha una, o nessuna se ancora nessun capitolo è stato aperto.
// Dexie cancella una proprietà aggiornata a undefined.
export async function clearCustomCover(kind, id) {
  const chapters = kind === 'series' ? await getChaptersUnderSeries(id) : await getChaptersUnderVolume(id);
  const first = chapters.filter((chapter) => chapter.thumbnail).sort((a, b) => a.number - b.number)[0];
  return tableForKind(kind).update(id, { coverThumbnail: first?.thumbnail, coverCustom: false });
}

// Tutti i capitoli categorizzati, con titolo della serie e numero del volume:
// alimenta i risultati-capitolo della ricerca globale nel Catalogo.
export async function getAllCategorizedChapters() {
  const chapters = await db.chapters.where('categorized').equals(1).toArray();
  const [seriesRows, volumeRows] = await Promise.all([db.series.toArray(), db.volumes.toArray()]);
  const seriesById = new Map(seriesRows.map((row) => [row.id, row]));
  const volumeById = new Map(volumeRows.map((row) => [row.id, row]));
  return chapters.map((chapter) => ({
    ...chapter,
    seriesTitle: seriesById.get(chapter.seriesId)?.title ?? '',
    volumeNumber: volumeById.get(chapter.volumeId)?.number ?? null,
  }));
}

// Segna (o toglie il segno) "letto" su tutti i capitoli di un volume. Il segno
// vive sul capitolo (markedRead), non nel progresso di lettura: i capitoli mai
// aperti non hanno un numero di pagine, quindi non si può "completare" una
// riga di progresso che non esiste — e non si vogliono nemmeno inondare gli
// "Ultimi letti" con un volume intero. Toglierlo, invece, azzera anche il
// progresso reale (lettura vera inclusa): è il solo modo di tornare a "non
// letto" senza lasciare capitoli completati per davvero.
export async function setVolumeMarkedRead(volumeId, markedRead) {
  const chapters = await rawChaptersUnderVolume(volumeId);
  await db.transaction('rw', db.chapters, db.readingProgress, async () => {
    for (const chapter of chapters) {
      await db.chapters.update(chapter.id, { markedRead });
    }
    if (!markedRead) {
      await db.readingProgress.bulkDelete(chapters.map((chapter) => chapter.id));
    }
  });
}

// Cosa proporre come "Continua a leggere" (Fase 29b): il capitolo letto per
// ultimo. Se quello è già finito e nello stesso volume ne segue un altro, si
// propone il successivo (isNext: parte dall'inizio), altrimenti lo stesso
// capitolo con il suo avanzamento. Restituisce null se non c'è nessun
// progresso di lettura: è anche la condizione che decide la pagina iniziale
// (se non c'è nulla da continuare, si parte dalla Libreria).
//
// Si guardano le ultime 5 righe e non solo la prima per non restare a mani
// vuote davanti a un progresso orfano (il capitolo nel frattempo rimosso).
export async function getContinueTarget() {
  const rows = await db.readingProgress.orderBy('lastReadAt').reverse().limit(5).toArray();
  for (const progress of rows) {
    const chapter = await db.chapters.get(progress.chapterId);
    if (!chapter) continue;

    const finished = progress.totalPages > 0 && progress.lastPageRead >= progress.totalPages - 1;
    if (finished) {
      const next = await getNextChapterInVolume(chapter.id);
      if (next) {
        return { ...(await enrichChapter(next)), lastPageRead: null, totalPages: null, isNext: true };
      }
    }
    return {
      ...(await enrichChapter(chapter)),
      lastPageRead: progress.lastPageRead,
      totalPages: progress.totalPages,
      isNext: false,
    };
  }
  return null;
}

// Toglie un capitolo da "In corso di lettura" e "Ultimi letti" — rimuove
// SOLO il progresso (pagina raggiunta, data ultima lettura, segnalibro
// manuale incluso: condivide la stessa riga), non il capitolo stesso, che
// resta in libreria. Usata dalla rimozione manuale in ReadingSections.
export async function clearReadingProgress(chapterId) {
  return db.readingProgress.delete(chapterId);
}

// --- Rinomina (Fase 27) ---
//
// Prima, un titolo sbagliato si correggeva solo rimuovendo la serie e
// ricategorizzando i capitoli. Le funzioni rifiutano un nome che esiste già
// (errore con `code: 'duplicate'`) invece di creare due serie o due volumi
// indistinguibili.
function duplicateError() {
  return Object.assign(new Error('duplicate'), { code: 'duplicate' });
}

// Per confrontare due titoli: "One Piece", "one-piece" e "ONE PIECE!" sono la
// stessa serie. Se il titolo è fatto solo di simboli (nulla da confrontare
// dopo la normalizzazione) si ripiega sul testo in minuscolo.
function titleKey(title) {
  return normalizeTitle(title) || title.trim().toLowerCase();
}

export async function renameSeries(seriesId, title) {
  const clean = title.trim();
  return db.transaction('rw', db.series, async () => {
    const key = titleKey(clean);
    const others = await db.series.toArray();
    if (others.some((series) => series.id !== seriesId && titleKey(series.title) === key)) {
      throw duplicateError();
    }
    await db.series.update(seriesId, { title: clean });
  });
}

// Un volume ha solo un numero: "rinominarlo" è cambiarne il numero, purché la
// serie non abbia già un altro volume con quel numero.
export async function renumberVolume(volumeId, number) {
  return db.transaction('rw', db.volumes, async () => {
    const volume = await db.volumes.get(volumeId);
    if (!volume) return;
    const siblings = await db.volumes.where('seriesId').equals(volume.seriesId).toArray();
    if (siblings.some((other) => other.id !== volumeId && other.number === number)) throw duplicateError();
    await db.volumes.update(volumeId, { number });
  });
}

// --- Statistiche di lettura (Fase 27) ---
//
// Il database non registra il TEMPO di lettura, solo fino a che pagina si è
// arrivati in ogni capitolo: le pagine lette sono quindi una stima (l'ultima
// pagina raggiunta, non quante volte si è tornati indietro) e il tempo è un
// calcolo su un tempo medio per pagina, dichiarato come tale.
export const SECONDS_PER_PAGE = 20;

// Un capitolo è finito se letto fino in fondo oppure segnato a mano (Fase 25).
function isFinished(chapter, progress) {
  if (chapter.markedRead) return true;
  return Boolean(progress && progress.totalPages > 0 && progress.lastPageRead >= progress.totalPages - 1);
}

export async function getReadingStats({ topCount = 5 } = {}) {
  const [progressRows, seriesRows, volumeCount, chapterCount, markedRead] = await Promise.all([
    db.readingProgress.toArray(),
    db.series.toArray(),
    db.volumes.count(),
    db.chapters.count(),
    // Segnati come letti a mano: nessun indice, ma sono righe leggere (le
    // miniature stanno in un'altra tabella, Fase 30a).
    db.chapters.filter((chapter) => Boolean(chapter.markedRead)).toArray(),
  ]);

  const chapters = await db.chapters.bulkGet(progressRows.map((progress) => progress.chapterId));
  const progressById = new Map(progressRows.map((progress) => [progress.chapterId, progress]));
  const seriesTitle = new Map(seriesRows.map((series) => [series.id, series.title]));

  let pagesRead = 0;
  let chaptersStarted = 0;
  let chaptersFinished = 0;
  const perSeries = new Map();

  function addToSeries(seriesId, pages, finished) {
    if (seriesId == null || !seriesTitle.has(seriesId)) return;
    const entry = perSeries.get(seriesId) ?? { id: seriesId, title: seriesTitle.get(seriesId), pages: 0, chaptersRead: 0 };
    entry.pages += pages;
    if (finished) entry.chaptersRead += 1;
    perSeries.set(seriesId, entry);
  }

  chapters.forEach((chapter) => {
    if (!chapter) return; // un progresso rimasto senza capitolo
    const progress = progressById.get(chapter.id);
    const finished = isFinished(chapter, progress);
    const pages = finished && progress?.totalPages ? progress.totalPages : (progress?.lastPageRead ?? 0) + 1;
    pagesRead += pages;
    chaptersStarted += 1;
    if (finished) chaptersFinished += 1;
    addToSeries(chapter.seriesId, pages, finished);
  });

  // Segnati a mano e senza un progresso proprio: contano come capitoli finiti
  // (le loro pagine non si conoscono, quindi non si sommano).
  markedRead.forEach((chapter) => {
    if (progressById.has(chapter.id)) return;
    chaptersStarted += 1;
    chaptersFinished += 1;
    addToSeries(chapter.seriesId, 0, true);
  });

  const topSeries = [...perSeries.values()]
    .filter((entry) => entry.pages > 0 || entry.chaptersRead > 0)
    .sort((a, b) => b.pages - a.pages || b.chaptersRead - a.chaptersRead)
    .slice(0, topCount);

  return {
    library: { series: seriesRows.length, volumes: volumeCount, chapters: chapterCount },
    reading: {
      pagesRead,
      chaptersStarted,
      chaptersFinished,
      estimatedMinutes: Math.round((pagesRead * SECONDS_PER_PAGE) / 60),
    },
    topSeries,
  };
}

// --- Backup e ripristino (Fase 30b) ---
//
// Il file di backup è un JSON valido, ma scritto "a righe": un'intestazione,
// una riga per serie, volumi e progressi, e poi UNA RIGA PER CAPITOLO (la sua
// miniatura è una stringa di ~20 KB). Così si può scrivere e rileggere un
// capitolo alla volta, senza mai tenere in memoria tutta la libreria: a 9.000
// capitoli il file pesa ~200 MB, e un'unica stringa JSON era troppo per un
// tablet. Il file resta leggibile anche da JSON.parse (è per questo che
// l'app sa ancora ripristinare i backup delle fasi precedenti, scritti in un
// colpo solo).
//
//   {"version":2,"layout":"lines","exportedAt":…,"light":false,"counts":{…},
//   "series":[…],
//   "volumes":[…],
//   "readingProgress":[…],
//   "chapters":[
//   {capitolo},
//   {capitolo}
//   ]}
//
// "Backup leggero" (light): senza le miniature dei capitoli, la parte più
// pesante. Le copertine di serie e volumi restano; quelle dei capitoli si
// rigenerano da sole la prossima volta che il capitolo viene aperto.

const BACKUP_BATCH = 200;
// Stima dello spazio che una riga di capitolo occupa nel file, miniatura
// esclusa (id, nome file, numeri, flag…). Serve solo per la stima mostrata
// in Impostazioni, non per scrivere il file.
const BACKUP_ROW_BYTES = 300;

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

async function rowsWithCoverAsDataUrl(rows) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      coverThumbnail: row.coverThumbnail ? await blobToDataUrl(row.coverThumbnail) : null,
    })),
  );
}

// Quanto occuperebbe il backup, completo e leggero, e di quanti capitoli si
// tratta: per far scegliere con cognizione di causa. Per le miniature somma le
// dimensioni dei Blob (senza leggerne il contenuto) e ci aggiunge il ~33% che
// la codifica in testo (base64) aggiunge.
export async function estimateBackupSize() {
  let thumbnailBytes = 0;
  await db.thumbnails.each((row) => {
    thumbnailBytes += row.blob.size;
  });
  let coverBytes = 0;
  await db.series.each((row) => {
    coverBytes += row.coverThumbnail?.size ?? 0;
  });
  await db.volumes.each((row) => {
    coverBytes += row.coverThumbnail?.size ?? 0;
  });
  const chapters = await db.chapters.count();
  const light = Math.round(chapters * BACKUP_ROW_BYTES + (coverBytes * 4) / 3);
  return { chapters, lightBytes: light, fullBytes: light + Math.round((thumbnailBytes * 4) / 3) };
}

// Genera il file di backup a pezzi di testo, uno dopo l'altro, senza tenere
// in memoria più di un blocco di capitoli per volta. Chi la consuma (vedi
// backupFile.js) scrive i pezzi dove preferisce: direttamente su un file, o in
// un Blob. L'handle dei capitoli NON viene esportato: è un FileSystemFileHandle
// legato a un file preciso di QUESTO browser/dispositivo, non ha alcun
// significato altrove — dopo un ripristino i capitoli vanno ricollegati
// re-importando gli stessi file (vedi getChapterByFileName/setChapterHandle).
export async function* exportBackupParts({ light = false, onProgress } = {}) {
  const [seriesRows, volumeRows, progressRows, chapterCount] = await Promise.all([
    db.series.toArray(),
    db.volumes.toArray(),
    db.readingProgress.toArray(),
    db.chapters.count(),
  ]);
  const header = {
    version: 2,
    layout: 'lines',
    exportedAt: Date.now(),
    light,
    counts: { series: seriesRows.length, volumes: volumeRows.length, chapters: chapterCount },
  };

  yield `${JSON.stringify(header).slice(0, -1)},\n`;
  yield `"series":${JSON.stringify(await rowsWithCoverAsDataUrl(seriesRows))},\n`;
  yield `"volumes":${JSON.stringify(await rowsWithCoverAsDataUrl(volumeRows))},\n`;
  yield `"readingProgress":${JSON.stringify(progressRows)},\n`;
  yield '"chapters":[\n';

  // I capitoli si leggono a blocchi, in ordine di id: "dopo l'ultimo id visto"
  // regge anche se nel frattempo la libreria cambia.
  let lastId = -Infinity;
  let done = 0;
  let first = true;
  for (;;) {
    const rows = await db.chapters.where('id').above(lastId).limit(BACKUP_BATCH).toArray();
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    const thumbnails = light ? [] : await db.thumbnails.bulkGet(rows.map((row) => row.id));
    const lines = await Promise.all(
      // eslint-disable-next-line no-unused-vars -- si estrae "handle" apposta per escluderlo dal risultato
      rows.map(async ({ handle, ...row }, index) =>
        JSON.stringify({
          ...row,
          thumbnail: thumbnails[index] ? await blobToDataUrl(thumbnails[index].blob) : null,
        }),
      ),
    );
    yield `${first ? '' : ',\n'}${lines.join(',\n')}`;
    first = false;
    done += rows.length;
    onProgress?.({ done, total: chapterCount });
  }

  yield '\n]}\n';
}

// Legge un file di testo riga per riga, a pezzi: non tiene mai in memoria il
// file intero.
async function* readLines(file) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let start = 0;
    let end;
    while ((end = buffer.indexOf('\n', start)) >= 0) {
      yield buffer.slice(start, end).replace(/\r$/, '');
      start = end + 1;
    }
    buffer = buffer.slice(start);
  }
  if (buffer) yield buffer.replace(/\r$/, '');
}

function parseHeaderLine(line) {
  try {
    const header = JSON.parse(line.replace(/,\s*$/, '') + '}');
    return header.layout === 'lines' && header.counts ? header : null;
  } catch {
    return null;
  }
}

// Controlla che il file sia un backup e ne riassume il contenuto, SENZA
// ripristinare nulla: serve alla finestra di conferma. Un backup "a righe" si
// riconosce dalla prima riga e non viene letto oltre; uno delle fasi
// precedenti (un unico JSON) va invece interpretato per intero.
//
// Restituisce { kind: 'lines' | 'legacy', light, counts, legacy? }, oppure
// lancia un Error con `code`: 'invalid' (non è un backup) o 'unreadable'
// (non è un JSON leggibile).
export async function inspectBackupFile(file) {
  const firstLine = (await file.slice(0, 65536).text()).split('\n', 1)[0].replace(/\r$/, '');
  const header = parseHeaderLine(firstLine);
  if (header) return { kind: 'lines', light: Boolean(header.light), counts: header.counts };

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw Object.assign(new Error('unreadable'), { code: 'unreadable' });
  }
  if (!backup || !Array.isArray(backup.series)) {
    throw Object.assign(new Error('invalid'), { code: 'invalid' });
  }
  return {
    kind: 'legacy',
    light: false,
    counts: {
      series: backup.series.length,
      volumes: (backup.volumes ?? []).length,
      chapters: (backup.chapters ?? []).length,
    },
    legacy: backup,
  };
}

// Dalle righe del file ai pezzi che servono al ripristino: serie, volumi,
// progressi (righe piccole, una volta sola) e i capitoli, uno alla volta.
async function readLinesBackup(file) {
  const parts = { series: [], volumes: [], readingProgress: [] };
  // Iteratore manuale: con un `for await … break` il generatore verrebbe
  // chiuso, e i capitoli non si potrebbero più leggere dopo l'intestazione.
  const lines = readLines(file)[Symbol.asyncIterator]();
  let inChapters = false;

  for (let step = await lines.next(); !step.done; step = await lines.next()) {
    if (step.value.startsWith('"chapters"')) {
      inChapters = true;
      break;
    }
    const match = /^"(series|volumes|readingProgress)":(.*?),?$/.exec(step.value);
    if (match) parts[match[1]] = JSON.parse(match[2]);
  }
  if (!inChapters) throw Object.assign(new Error('invalid'), { code: 'invalid' });

  async function* chapters() {
    for (let step = await lines.next(); !step.done; step = await lines.next()) {
      if (step.value.startsWith(']')) return;
      const text = step.value.replace(/,$/, '');
      if (text) yield JSON.parse(text);
    }
  }
  return { ...parts, chapters: chapters() };
}

async function* chaptersOf(list) {
  for (const chapter of list) yield chapter;
}

// Sostituisce l'intera libreria con quella di un backup: cancella le tabelle e
// le ripopola dentro un'unica transazione (o va tutto a buon fine, o — in caso
// di errore a metà — non resta una libreria a metà ripristinata). Gli id
// originali vengono preservati (bulkAdd con chiave esplicita), così i
// collegamenti serie/volume/capitolo/progresso restano coerenti.
//
// Tutta la parte lunga (lettura, conversione delle miniature) avviene PRIMA
// della transazione: se il file è danneggiato o la memoria finisce, la
// libreria attuale non è stata toccata.
//
// `inspected` è il risultato di inspectBackupFile.
export async function restoreBackupFile(file, inspected, { onProgress } = {}) {
  const source =
    inspected.kind === 'lines'
      ? await readLinesBackup(file)
      : {
          series: inspected.legacy.series ?? [],
          volumes: inspected.legacy.volumes ?? [],
          readingProgress: inspected.legacy.readingProgress ?? [],
          chapters: chaptersOf(inspected.legacy.chapters ?? []),
        };

  const total = inspected.counts.chapters;
  const chapters = [];
  const thumbnails = [];
  let done = 0;
  for await (const row of source.chapters) {
    // Un backup (anche vecchio, versione 1) ha i flag come true/false e le
    // miniature dentro il capitolo: qui si portano al formato attuale (0/1 e
    // tabella a parte).
    const { thumbnail, ...rest } = row;
    if (thumbnail) thumbnails.push({ chapterId: rest.id, blob: await dataUrlToBlob(thumbnail) });
    chapters.push({ ...rest, categorized: rest.categorized ? 1 : 0, favorite: rest.favorite ? 1 : 0 });
    done += 1;
    if (done % BACKUP_BATCH === 0 || done === total) onProgress?.({ done, total });
  }

  // Un file troncato in corrispondenza di un a-capo si leggerebbe senza
  // errori, ma incompleto: l'intestazione dice quanti capitoli devono esserci.
  if (done !== total) throw new Error(`Backup incompleto: ${done} capitoli su ${total}`);

  // La data di ultima lettura di ogni serie, che i backup precedenti non conoscono.
  const lastRead = computeSeriesLastRead(chapters, source.readingProgress);
  const restoreCover = async ({ coverThumbnail, ...row }) => ({
    ...row,
    ...(coverThumbnail ? { coverThumbnail: await dataUrlToBlob(coverThumbnail) } : {}),
  });
  const series = await Promise.all(
    source.series.map(async (row) => ({
      ...(await restoreCover(row)),
      ...(lastRead.has(row.id) ? { lastReadAt: lastRead.get(row.id) } : {}),
    })),
  );
  const volumes = await Promise.all(source.volumes.map(restoreCover));

  await db.transaction(
    'rw',
    [db.series, db.volumes, db.chapters, db.readingProgress, db.thumbnails],
    async () => {
      await Promise.all([
        db.series.clear(),
        db.volumes.clear(),
        db.chapters.clear(),
        db.readingProgress.clear(),
        db.thumbnails.clear(),
      ]);
      await Promise.all([
        db.series.bulkAdd(series),
        db.volumes.bulkAdd(volumes),
        db.chapters.bulkAdd(chapters),
        db.readingProgress.bulkAdd(source.readingProgress),
        db.thumbnails.bulkAdd(thumbnails),
      ]);
    },
  );
}
