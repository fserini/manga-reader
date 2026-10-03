// Importazione di file nella libreria: la logica che prima viveva dentro la
// pagina Libreria, estratta (Fase 29b, ADR-002) perché ora la usano due
// pagine: la Libreria (import di molti file o di una cartella) e il Lettore
// ("Apri un file…", un file solo che va riconosciuto in libreria o importato).
import { getChapterByFileName, importChapter, setChapterHandle } from './db.js';
import { isArchiveFileName, getFileExtension } from './fileAccess.js';
import { validateArchive } from './comicFile.js';

// Prende un elenco di handle (da file o cartella), scarta i formati non
// supportati (ricordandone le estensioni, per avvisare), blocca i duplicati
// (stesso nome file già collegato a un handle), scarta gli archivi non
// leggibili (corrotti, senza immagini, con password) e importa il resto. La
// validazione apre il file (senza estrarne le pagine, vedi validateArchive)
// solo dopo aver già escluso estensione sbagliata e duplicati — non ha
// senso pagare il costo dell'apertura per un file che verrebbe comunque
// scartato.
//
// Un capitolo con lo stesso nome file può già esistere ma SENZA handle: è
// il caso di un capitolo ripristinato da un backup (Fase 16), il cui
// riferimento al file fisico non è mai esportabile. Invece di scartarlo
// come duplicato, lo si ricollega aggiornando solo il suo handle.
export async function importHandles(handles) {
  let imported = 0;
  let relinked = 0;
  let duplicates = 0;
  let ignored = 0;
  const failures = { invalid: 0, encrypted: 0, timeout: 0 };
  const unsupportedTypes = new Set();

  for (const handle of handles) {
    if (!isArchiveFileName(handle.name)) {
      ignored += 1;
      unsupportedTypes.add(getFileExtension(handle.name));
      continue;
    }

    const existing = await getChapterByFileName(handle.name);
    if (existing && existing.handle) {
      duplicates += 1;
      continue;
    }

    const file = await handle.getFile();
    const verdict = await validateArchive(file);
    if (verdict !== 'ok') {
      failures[verdict] += 1;
      continue;
    }

    if (existing) {
      await setChapterHandle(existing.id, handle);
      relinked += 1;
      continue;
    }

    await importChapter({ fileName: handle.name, handle });
    imported += 1;
  }

  return {
    imported,
    relinked,
    duplicates,
    ignored,
    unreadable: failures.invalid + failures.encrypted + failures.timeout,
    invalid: failures.invalid,
    encrypted: failures.encrypted,
    timeout: failures.timeout,
    unsupportedTypes: [...unsupportedTypes],
  };
}

// Dal file scelto nel Lettore al capitolo da aprire. Il file si riconosce IN
// LIBRERIA PER NOME, come per i duplicati dell'import: se c'è, si apre quel
// capitolo (con pagina, segnalibro, preferiti e statistiche già suoi); se non
// c'è, si importa con le stesse regole (validazione) e si apre il nuovo.
//
// Anche per un capitolo già noto si sostituisce l'handle con quello appena
// scelto: l'utente ha appena dato il permesso su QUEL file, mentre l'handle
// salvato potrebbe averlo perso (o puntare a un file spostato).
//
// Restituisce { ok: true, chapterId, known } oppure { ok: false, reason } con
// reason 'unsupported' (più 'extension'), 'invalid', 'encrypted' o 'timeout'.
export async function resolveFileToChapter(handle) {
  if (!isArchiveFileName(handle.name)) {
    return { ok: false, reason: 'unsupported', extension: getFileExtension(handle.name) };
  }

  const existing = await getChapterByFileName(handle.name);
  if (existing) {
    await setChapterHandle(existing.id, handle);
    return { ok: true, chapterId: existing.id, known: true };
  }

  const verdict = await validateArchive(await handle.getFile());
  if (verdict !== 'ok') return { ok: false, reason: verdict };

  const chapterId = await importChapter({ fileName: handle.name, handle });
  return { ok: true, chapterId, known: false };
}
