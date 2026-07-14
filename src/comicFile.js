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

async function extractCbzPages(file) {
  const zip = await JSZip.loadAsync(file);
  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  return Promise.all(imageEntries.map((entry) => entry.async('blob')));
}

async function extractCbrPages(file) {
  const archive = await Archive.open(file);
  await archive.extractFiles();
  const filesArray = await archive.getFilesArray();

  return filesArray
    .filter(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.path + a.file.name, b.path + b.file.name))
    .map(({ file: entry }) => entry);
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
// non è un archivio valido; il chiamante lo intercetta per mostrare un messaggio.
export async function extractPageGroups(file) {
  const rawImages = isCbrFileName(file.name)
    ? await extractCbrPages(file)
    : await extractCbzPages(file);

  return Promise.all(rawImages.map(splitSpreadIfNeeded));
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
