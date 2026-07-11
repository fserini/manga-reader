// Accesso ai file dell'utente tramite la File System Access API.
//
// Questo modulo isola tutto ciò che riguarda i picker del browser e gli
// handle ai file: il resto dell'app (la Libreria) chiama queste funzioni
// senza sapere come funziona l'API sottostante. Salviamo poi gli handle in
// IndexedDB (vedi db.js), così l'app resta un "visore" sui file originali e
// non ne duplica i byte.

const ARCHIVE_EXTENSION_REGEX = /\.(cbz|cbr)$/i;

// La File System Access API (showOpenFilePicker/showDirectoryPicker) esiste
// solo su browser Chromium (Chrome/Edge, anche su Android da Chrome M132).
// Su Firefox/Safari non c'è: lo verifichiamo per mostrare un messaggio chiaro
// invece di far esplodere l'app.
export function isFileSystemAccessSupported() {
  return 'showOpenFilePicker' in window;
}

export function isArchiveFileName(fileName) {
  return ARCHIVE_EXTENSION_REGEX.test(fileName);
}

// Apre il selettore file (multi-selezione) e restituisce gli handle scelti.
// Nota: non filtriamo qui per estensione — su Android i filtri MIME/estensione
// del picker vengono a volte ignorati, quindi la Libreria filtra comunque il
// risultato con isArchiveFileName.
export async function pickFiles() {
  const handles = await window.showOpenFilePicker({ multiple: true });
  return handles;
}

// Apre il selettore cartella e raccoglie ricorsivamente gli handle di tutti i
// file archivio (.cbz/.cbr) contenuti, comprese le sottocartelle.
export async function pickDirectory() {
  const directoryHandle = await window.showDirectoryPicker();
  return collectArchiveHandles(directoryHandle);
}

async function collectArchiveHandles(directoryHandle) {
  const handles = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
      if (isArchiveFileName(entry.name)) handles.push(entry);
    } else if (entry.kind === 'directory') {
      handles.push(...(await collectArchiveHandles(entry)));
    }
  }
  return handles;
}

// Verifica/richiede il permesso di leggere il file puntato dall'handle.
// Un handle riletto da IndexedDB dopo un reload torna in stato "prompt": il
// permesso va richiesto di nuovo, e requestPermission funziona solo se
// chiamato durante un gesto dell'utente (es. un click). Restituisce true se
// il permesso è concesso.
export async function verifyPermission(handle, mode = 'read') {
  const options = { mode };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

// Legge il contenuto del file puntato da un handle e lo restituisce come File
// (un Blob con nome), pronto per JSZip/libarchive nel Lettore.
export async function readFileFromHandle(handle) {
  return handle.getFile();
}
