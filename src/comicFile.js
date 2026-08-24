// Lettura di un file comic (CBZ/CBR) e generazione della miniatura.
//
// Questo modulo isola tutto ciò che riguarda l'estrazione delle pagine da un
// archivio: il Lettore lo usa senza sapere se dietro c'è JSZip (CBZ) o
// libarchive.js (CBR). Restituisce sempre "gruppi di pagine": normalmente un
// gruppo = una pagina, ma una tavola esportata come doppia pagina diventa un
// gruppo di due mezze pagine (vedi splitSpreadIfNeeded).

import JSZip from 'jszip';
import { Archive } from 'libarchive.js';

Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;
const SPREAD_ASPECT_RATIO_THRESHOLD = 1;
const THUMBNAIL_MAX_WIDTH = 240;

function naturalCompare(nameA, nameB) {
  return nameA.localeCompare(nameB, undefined, { numeric: true });
}

function isCbrFileName(fileName) {
  return /\.cbr$/i.test(fileName);
}

// Estrae il contenuto di una singola voce, senza propagare l'errore verso
// l'alto: se quella pagina è danneggiata (dati compressi corrotti), il resto
// dell'archivio resta comunque leggibile. `null` è il segnale "pagina
// illeggibile", riconosciuto più avanti dal Lettore.
async function extractEntrySafely(entry) {
  try {
    return await entry.async('blob');
  } catch {
    return null;
  }
}

async function extractCbzPages(file) {
  const zip = await JSZip.loadAsync(file);
  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  return Promise.all(imageEntries.map((entry) => extractEntrySafely(entry)));
}

async function extractCbrPages(file) {
  const archive = await Archive.open(file);
  await archive.extractFiles();
  const filesArray = await archive.getFilesArray();

  return filesArray
    .filter(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.path + a.file.name, b.path + b.file.name))
    .map(({ file: entry }) => entry); // già estratti da extractFiles(): mai null qui
}

// Verifica che il file sia un archivio apribile e contenga almeno
// un'immagine, SENZA estrarre le pagine — usata in fase di import, dove
// estrarre pesa inutilmente se poi l'utente non legge subito quel capitolo.
export async function isValidArchive(file) {
  try {
    if (isCbrFileName(file.name)) {
      const archive = await Archive.open(file);
      const filesArray = await archive.getFilesArray(); // solo elenco, nessuna estrazione
      return filesArray.some(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name));
    }
    const zip = await JSZip.loadAsync(file);
    return Object.values(zip.files).some((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name));
  } catch {
    return false;
  }
}

// Alcune edizioni esportano ogni tavola già come doppia pagina (un solo file
// più largo che alto). La tagliamo in due pagine logiche separate, sempre
// nello stesso ordine fisico [sinistra, destra]: chi la mostra deciderà
// l'ordine di lettura in base alla direzione scelta.
async function splitSpreadIfNeeded(blob) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  if (width / height <= SPREAD_ASPECT_RATIO_THRESHOLD) {
    bitmap.close();
    return [blob];
  }

  const halfWidth = Math.round(width / 2);

  const left = document.createElement('canvas');
  left.width = halfWidth;
  left.height = height;
  left.getContext('2d').drawImage(bitmap, 0, 0, halfWidth, height, 0, 0, halfWidth, height);

  const right = document.createElement('canvas');
  right.width = width - halfWidth;
  right.height = height;
  right
    .getContext('2d')
    .drawImage(bitmap, halfWidth, 0, width - halfWidth, height, 0, 0, width - halfWidth, height);

  bitmap.close();

  return Promise.all([
    new Promise((resolve) => left.toBlob(resolve)),
    new Promise((resolve) => right.toBlob(resolve)),
  ]);
}

// Estrae tutte le pagine come "gruppi" di Blob. Lancia un errore se il file
// non è affatto un archivio valido (l'intero capitolo è illeggibile); il
// chiamante lo intercetta per mostrare un messaggio. Una singola pagina
// danneggiata, invece, NON fa fallire tutto: diventa un gruppo [null], che il
// Lettore riconosce e mostra come "pagina non disponibile".
export async function extractPageGroups(file) {
  const rawImages = isCbrFileName(file.name)
    ? await extractCbrPages(file)
    : await extractCbzPages(file);

  return Promise.all(
    rawImages.map(async (blob) => {
      if (!blob) return [null];
      try {
        return await splitSpreadIfNeeded(blob);
      } catch {
        return [null];
      }
    }),
  );
}

// Genera una miniatura (Blob JPEG) da un'immagine di pagina, ridimensionata a
// una larghezza contenuta: serve come copertina nel catalogo della Libreria.
export async function makeThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}
