// Lettura di un archivio di immagini (CBZ/CBR e affini) e generazione della
// miniatura.
//
// Questo modulo isola tutto ciò che riguarda l'estrazione delle pagine da un
// archivio: il Lettore lo usa senza sapere se dietro c'è JSZip (ZIP) o
// libarchive.js (RAR, 7z). Restituisce sempre "gruppi di pagine": normalmente
// un gruppo = una pagina, ma una tavola esportata come doppia pagina diventa
// un gruppo di due mezze pagine (vedi splitSpreadIfNeeded).

import JSZip from 'jszip';
import { Archive } from 'libarchive.js';

// BASE_URL e non un percorso assoluto: in produzione l'app vive sotto
// /manga-reader/ (GitHub Pages), dove "/libarchive/..." non esiste. Se il worker
// non si carica, Archive.open resta in attesa per sempre, senza errori.
Archive.init({ workerUrl: `${import.meta.env.BASE_URL}libarchive/worker-bundle.js` });

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;
const SPREAD_ASPECT_RATIO_THRESHOLD = 1;
const THUMBNAIL_MAX_WIDTH = 240;
// Tempo massimo per avviare il worker e leggere l'intestazione di un archivio.
// Oltre, qualcosa non va (il worker non si carica: la libreria in quel caso
// non segnala errori, aspetta e basta) e meglio un errore chiaro che un'attesa
// infinita. NON copre l'estrazione delle pagine, che su un volume grande può
// legittimamente richiedere di più.
const ARCHIVE_OPEN_TIMEOUT_MS = 30000;

function naturalCompare(nameA, nameB) {
  return nameA.localeCompare(nameB, undefined, { numeric: true });
}

// Perché un archivio non si può leggere, in una forma che chi chiama sa
// tradurre in un messaggio (vedi le chiavi library.notice.* e reader.errors.*).
export class ArchiveError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // 'invalid' | 'encrypted' | 'timeout'
  }
}

// Quale lettore serve a un file: 'zip' (JSZip) oppure 'libarchive' (RAR, 7z).
// Si guardano i primi byte, NON l'estensione: i file con l'estensione sbagliata
// sono comuni (molti ".cbr" sono in realtà ZIP, e un ".cbz" può essere un RAR),
// e un ZIP letto da JSZip non ha nemmeno bisogno del worker. Solo se la firma
// non è riconosciuta si ripiega sull'estensione, come si faceva prima.
const ZIP_SIGNATURE = [0x50, 0x4b]; // "PK"
const RAR_SIGNATURE = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]; // "Rar!" + 1A 07
const SEVEN_ZIP_SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]; // "7z" BC AF 27 1C
const LIBARCHIVE_EXTENSIONS = ['cbr', 'rar', '7z', 'cb7'];

export async function detectReader(file) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const startsWith = (signature) => signature.every((byte, index) => head[index] === byte);

  if (startsWith(ZIP_SIGNATURE)) return 'zip';
  if (startsWith(RAR_SIGNATURE) || startsWith(SEVEN_ZIP_SIGNATURE)) return 'libarchive';

  const extension = /\.([^./\\]+)$/.exec(file.name)?.[1].toLowerCase() ?? '';
  return LIBARCHIVE_EXTENSIONS.includes(extension) ? 'libarchive' : 'zip';
}

// Apre un archivio con libarchive, con un tetto di tempo e con il controllo
// delle password. Chi lo usa deve chiamare archive.close(): ogni apertura crea
// un worker (con il suo WASM) che altrimenti resterebbe vivo per sempre —
// importando molti capitoli si accumulerebbero decine di worker.
async function openLibarchive(file) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ArchiveError('timeout')), ARCHIVE_OPEN_TIMEOUT_MS);
  });

  let archive;
  try {
    archive = await Promise.race([Archive.open(file), timeout]);
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError('invalid');
  } finally {
    clearTimeout(timer);
  }

  // hasEncryptedData restituisce true/false, o null se non lo sa dire: solo un
  // "true" certo è motivo di rifiuto; un errore nel controllo non deve
  // impedire di leggere un archivio che magari è perfettamente normale.
  let encrypted;
  try {
    encrypted = (await archive.hasEncryptedData()) === true;
  } catch {
    encrypted = false;
  }
  if (encrypted) {
    await archive.close();
    throw new ArchiveError('encrypted');
  }
  return archive;
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

async function loadZip(file) {
  try {
    return await JSZip.loadAsync(file);
  } catch (error) {
    // JSZip riconosce lo ZIP cifrato e lo dice a parole, non con un codice.
    throw new ArchiveError(/encrypted/i.test(error?.message ?? '') ? 'encrypted' : 'invalid');
  }
}

async function extractZipPages(file) {
  const zip = await loadZip(file);
  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  return Promise.all(imageEntries.map((entry) => extractEntrySafely(entry)));
}

async function extractLibarchivePages(file) {
  const archive = await openLibarchive(file);
  try {
    await archive.extractFiles();
    const filesArray = await archive.getFilesArray();

    return filesArray
      .filter(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name))
      .sort((a, b) => naturalCompare(a.path + a.file.name, b.path + b.file.name))
      .map(({ file: entry }) => entry); // già estratti da extractFiles(): mai null qui
  } catch {
    throw new ArchiveError('invalid');
  } finally {
    // Le pagine sono già File veri, indipendenti dal worker: si può chiuderlo.
    await archive.close();
  }
}

// Verifica che il file sia un archivio apribile e contenga almeno
// un'immagine, SENZA estrarre le pagine — usata in fase di import, dove
// estrarre pesa inutilmente se poi l'utente non legge subito quel capitolo.
// Restituisce 'ok' oppure il motivo del rifiuto: 'invalid' (non è un archivio
// leggibile, o non contiene immagini), 'encrypted' (protetto da password),
// 'timeout' (il lettore di RAR/7z non si è avviato in tempo).
export async function validateArchive(file) {
  try {
    if ((await detectReader(file)) === 'zip') {
      const zip = await loadZip(file);
      const hasImage = Object.values(zip.files).some(
        (entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name),
      );
      return hasImage ? 'ok' : 'invalid';
    }

    const archive = await openLibarchive(file);
    try {
      const filesArray = await archive.getFilesArray(); // solo elenco, nessuna estrazione
      return filesArray.some(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name)) ? 'ok' : 'invalid';
    } finally {
      await archive.close();
    }
  } catch (error) {
    return error instanceof ArchiveError ? error.reason : 'invalid';
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
  const rawImages =
    (await detectReader(file)) === 'zip' ? await extractZipPages(file) : await extractLibarchivePages(file);

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
