// Lettura dei PDF (Fase 28b).
//
// Un archivio CBZ/CBR contiene immagini già pronte: si estraggono tutte, si
// mostrano. Un PDF no: le pagine vanno DISEGNATE (pdf.js le renderizza su un
// canvas), un lavoro che costa tempo e memoria. Disegnarle tutte all'apertura
// vorrebbe dire attendere a lungo e riempire la memoria con un volume da 200
// pagine. Perciò qui le pagine sono "pigre": il Lettore riceve per ognuna un
// oggetto { ratio, load } e chiama load() solo quando la pagina serve (o sta per
// servire). Il documento resta aperto finché si legge il capitolo, e dispose()
// lo chiude.
//
// La libreria pdf.js (pesante, con il suo worker) si carica solo qui, la prima
// volta che si apre un PDF: chi legge solo CBZ non la scarica mai.

import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { ArchiveError } from './archiveError.js';

// Tempo massimo per aprire il documento (come per i RAR/7z): oltre, meglio un
// errore chiaro che un'attesa infinita. Non copre il disegno delle pagine.
const PDF_OPEN_TIMEOUT_MS = 30000;
// Risoluzione di disegno: lato lungo di una pagina normale, e larghezza di una
// doppia pagina (che poi si divide in due metà, vedi sotto). Abbastanza per
// leggere bene anche con lo zoom del Lettore, senza canvas enormi.
const RENDER_LONG_SIDE_PX = 2000;
const RENDER_SPREAD_WIDTH_PX = 2800;
const JPEG_QUALITY = 0.88;
// Quante pagine già disegnate si tengono da parte: tornare indietro di una o
// due pagine non deve costringere a ridisegnarle.
const RENDER_CACHE_SIZE = 8;
// Come per le immagini degli archivi: una pagina più larga che alta è una
// doppia pagina e si divide in due (vedi splitSpreadIfNeeded in comicFile.js).
const SPREAD_ASPECT_RATIO_THRESHOLD = 1;
// Quante pagine alla volta si interrogano per conoscerne le dimensioni.
const SIZE_BATCH = 25;

// pdf.js "legacy": la versione compatibile anche con i browser meno recenti
// (alcuni tablet Android non aggiornano Chrome a lungo).
let pdfjsPromise = null;
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((library) => {
    library.GlobalWorkerOptions.workerSrc = workerUrl;
    return library;
  });
  return pdfjsPromise;
}

// Apre il documento e restituisce { pdf, destroy }: destroy() chiude il
// documento e libera il worker (in pdf.js lo si fa dal "task" di caricamento,
// non dal documento). Traduce gli errori di pdf.js nei motivi che l'app sa
// spiegare: 'encrypted' (serve una password), 'timeout', 'invalid'.
async function openPdf(file) {
  const library = await loadPdfjs();
  const task = library.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ArchiveError('timeout')), PDF_OPEN_TIMEOUT_MS);
  });

  try {
    const pdf = await Promise.race([task.promise, timeout]);
    return { pdf, destroy: () => task.destroy() };
  } catch (error) {
    task.destroy();
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError(error?.name === 'PasswordException' ? 'encrypted' : 'invalid');
  } finally {
    clearTimeout(timer);
  }
}

// Per l'import: il file è un PDF leggibile, senza password, con almeno una
// pagina? Non disegna nulla. Restituisce 'ok' o il motivo del rifiuto.
export async function validatePdf(file) {
  let opened;
  try {
    opened = await openPdf(file);
    return opened.pdf.numPages > 0 ? 'ok' : 'invalid';
  } catch (error) {
    return error instanceof ArchiveError ? error.reason : 'invalid';
  } finally {
    await opened?.destroy();
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

// Una pagina "pigra" è un oggetto { ratio, load }: `ratio` (larghezza/altezza)
// serve a tenerle il posto nello scorrimento prima che sia disegnata, `load()`
// la disegna e restituisce un Blob (o null se non riesce).
export function isLazyPage(page) {
  return page != null && typeof page === 'object' && typeof page.load === 'function';
}

// Il Blob di una pagina, che sia già pronto (archivio) o da disegnare (PDF).
export async function resolvePageBlob(page) {
  if (!page) return null;
  return isLazyPage(page) ? page.load() : page;
}

// Apre un PDF e restituisce { groups, dispose }: gruppi di pagine come per gli
// archivi (una pagina per gruppo, due metà per una doppia pagina), ma fatti di
// pagine pigre. Per conoscere quali pagine sono doppie servono le dimensioni di
// ognuna: si leggono (senza disegnare) a gruppi di SIZE_BATCH.
export async function openPdfPages(file) {
  const { pdf, destroy } = await openPdf(file);
  let disposed = false;

  const sizes = [];
  for (let start = 1; start <= pdf.numPages; start += SIZE_BATCH) {
    const numbers = Array.from({ length: Math.min(SIZE_BATCH, pdf.numPages - start + 1) }, (_, i) => start + i);
    sizes.push(
      ...(await Promise.all(
        numbers.map(async (number) => {
          const viewport = (await pdf.getPage(number)).getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height };
        }),
      )),
    );
  }

  // Pagine già disegnate (o in corso di disegno), dalla più vecchia alla più
  // recente: si tengono le ultime RENDER_CACHE_SIZE. Si memorizza la promessa,
  // così due richieste della stessa pagina (le due metà di una doppia, o il
  // precaricamento) non la disegnano due volte.
  const cache = new Map();
  function remember(key, make) {
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key); // la riporta in fondo: è la più recente
      cache.set(key, hit);
      return hit;
    }
    const promise = make().catch(() => null); // una pagina che non si disegna non rompe il resto
    cache.set(key, promise);
    while (cache.size > RENDER_CACHE_SIZE) cache.delete(cache.keys().next().value);
    return promise;
  }

  async function renderWhole(number) {
    if (disposed) return null;
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale =
      base.width / base.height > SPREAD_ASPECT_RATIO_THRESHOLD
        ? RENDER_SPREAD_WIDTH_PX / base.width
        : RENDER_LONG_SIDE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    // Un PDF può avere lo sfondo trasparente: in JPEG diventerebbe nero.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    page.cleanup();

    const blob = await canvasToBlob(canvas);
    canvas.width = 0; // libera subito la memoria del canvas
    canvas.height = 0;
    return blob;
  }

  async function renderHalf(number, side) {
    const whole = await remember(`${number}`, () => renderWhole(number));
    if (!whole) return null;
    const bitmap = await createImageBitmap(whole);
    const half = Math.round(bitmap.width / 2);
    const canvas = document.createElement('canvas');
    const width = side === 'left' ? half : bitmap.width - half;
    canvas.width = width;
    canvas.height = bitmap.height;
    canvas
      .getContext('2d')
      .drawImage(bitmap, side === 'left' ? 0 : half, 0, width, bitmap.height, 0, 0, width, bitmap.height);
    bitmap.close();
    const blob = await canvasToBlob(canvas);
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  }

  // Dopo una pagina, si prepara la successiva in background: nella lettura è
  // quella che serve subito dopo, e così appare già pronta.
  function prefetch(number) {
    if (disposed || number > pdf.numPages || cache.has(`${number}`)) return;
    setTimeout(() => {
      if (!disposed) remember(`${number}`, () => renderWhole(number));
    }, 0);
  }

  function lazyPage(number, side, ratio) {
    const key = side ? `${number}-${side}` : `${number}`;
    return {
      ratio,
      load: async () => {
        const blob = await remember(key, () => (side ? renderHalf(number, side) : renderWhole(number)));
        prefetch(number + 1);
        return blob;
      },
    };
  }

  const groups = sizes.map(({ width, height }, index) => {
    const number = index + 1;
    return width / height > SPREAD_ASPECT_RATIO_THRESHOLD
      ? [lazyPage(number, 'left', width / 2 / height), lazyPage(number, 'right', width / 2 / height)]
      : [lazyPage(number, null, width / height)];
  });

  return {
    groups,
    dispose() {
      disposed = true;
      cache.clear();
      destroy();
    },
  };
}
