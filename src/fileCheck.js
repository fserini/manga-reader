import { getChaptersForFileCheck } from './db.js';

// Ricontrollo dei file collegati alla libreria (Fase 26): quali capitoli
// puntano a un file che non c'è più (spostato o cancellato fuori dall'app)?
// Prima lo si scopriva solo aprendo quel capitolo.
//
// Cosa si può sapere, e cosa no. Per leggere un file serve il permesso, e
// richiederlo è possibile solo durante un tocco, uno per file: un ricontrollo
// in blocco non può chiederli. Quindi si controllano solo i file il cui
// permesso è già concesso; gli altri restano "non verificabili" (un file che
// manca davvero, senza permesso, non si distingue da uno presente) e si
// riportano come tali, senza inventare un verdetto.
const BATCH_SIZE = 20;

async function checkHandle(handle) {
  try {
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return 'unverified';
    await handle.getFile(); // lancia NotFoundError se il file non esiste più
    return 'ok';
  } catch (error) {
    return error?.name === 'NotFoundError' ? 'missing' : 'unverified';
  }
}

// Restituisce { total, ok, missing: [capitolo], unverified, withoutHandle,
// cancelled }. `onProgress({ done, total })` a ogni blocco; `isCancelled()`
// permette di interrompere (il dialog chiuso a metà).
export async function checkLibraryFiles({ onProgress, isCancelled = () => false } = {}) {
  const chapters = await getChaptersForFileCheck();
  // I capitoli senza handle non sono "mancanti": sono quelli ripristinati da
  // un backup, in attesa di essere ricollegati reimportando il file (Fase 16).
  const linked = chapters.filter((chapter) => chapter.handle);
  const result = {
    total: chapters.length,
    ok: 0,
    missing: [],
    unverified: 0,
    withoutHandle: chapters.length - linked.length,
    cancelled: false,
  };

  for (let start = 0; start < linked.length; start += BATCH_SIZE) {
    if (isCancelled()) {
      result.cancelled = true;
      return result;
    }
    const batch = linked.slice(start, start + BATCH_SIZE);
    const verdicts = await Promise.all(batch.map((chapter) => checkHandle(chapter.handle)));
    verdicts.forEach((verdict, index) => {
      if (verdict === 'ok') result.ok += 1;
      else if (verdict === 'missing') result.missing.push(batch[index]);
      else result.unverified += 1;
    });
    onProgress?.({ done: Math.min(start + BATCH_SIZE, linked.length), total: linked.length });
  }
  return result;
}
