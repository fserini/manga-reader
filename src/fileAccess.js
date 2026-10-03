// Accesso ai file dell'utente tramite la File System Access API.
//
// Questo modulo isola tutto ciò che riguarda i picker del browser e gli
// handle ai file: il resto dell'app (la Libreria) chiama queste funzioni
// senza sapere come funziona l'API sottostante. Salviamo poi gli handle in
// IndexedDB (vedi db.js), così l'app resta un "visore" sui file originali e
// non ne duplica i byte.

// Le estensioni di archivio accettate all'import — l'unico elenco dell'app: i
// picker, i testi "formati supportati" e il filtro delle cartelle derivano
// tutti da qui. cbz/cbr/cb7 sono i nomi "da fumetto" di ZIP/RAR/7z, ma l'app
// non si fida dell'estensione per scegliere come leggerli (vedi comicFile.js).
const ARCHIVE_EXTENSIONS = ['cbz', 'cbr', 'zip', 'rar', '7z', 'cb7'];

export const SUPPORTED_FORMATS_LABEL = ARCHIVE_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ');

// Estensioni che in una cartella sono "rumore" normale (copertine sciolte,
// note, file di sistema): scandendo una cartella non le segnaliamo come
// "formato non supportato", altrimenti ogni cartella con una cover.jpg
// produrrebbe un avviso. Un file scelto a mano dal picker, invece, viene
// sempre segnalato se non è supportato.
const IGNORED_IN_FOLDERS = new Set([
  '', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'txt', 'nfo', 'ini', 'db', 'xml',
  'json', 'html', 'htm', 'url', 'md', 'log', 'sfv', 'srt', 'ds_store',
]);

// L'estensione in minuscolo, senza punto ('' se il nome non ne ha).
export function getFileExtension(fileName) {
  const match = /\.([^./\\]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : '';
}

// La File System Access API (showOpenFilePicker/showDirectoryPicker) esiste
// solo su browser Chromium (Chrome/Edge, anche su Android da Chrome M132).
// Su Firefox/Safari non c'è: lo verifichiamo per mostrare un messaggio chiaro
// invece di far esplodere l'app.
export function isFileSystemAccessSupported() {
  return 'showOpenFilePicker' in window;
}

export function isArchiveFileName(fileName) {
  return ARCHIVE_EXTENSIONS.includes(getFileExtension(fileName));
}

// Apre il selettore file (multi-selezione) e restituisce gli handle scelti.
// Nota: non filtriamo qui per estensione — su Android i filtri MIME/estensione
// del picker vengono a volte ignorati, quindi la Libreria filtra comunque il
// risultato con isArchiveFileName.
export async function pickFiles() {
  const handles = await window.showOpenFilePicker({ multiple: true });
  return handles;
}

// Apre il selettore per UN file solo: serve a "Apri un file…" nel Lettore, che
// poi cerca quel file in libreria o lo importa (vedi resolveFileToChapter).
export async function pickFile() {
  const [handle] = await window.showOpenFilePicker({ multiple: false });
  return handle;
}

// Apre il selettore cartella e raccoglie ricorsivamente gli handle dei file
// contenuti, comprese le sottocartelle: gli archivi supportati, più gli
// altri file che non sono "rumore" noto (vedi IGNORED_IN_FOLDERS). Questi
// ultimi non verranno importati: li passiamo alla Libreria perché possa
// avvisare che quel formato non è supportato, invece di saltarli in silenzio.
export async function pickDirectory() {
  const directoryHandle = await window.showDirectoryPicker();
  return collectCandidateHandles(directoryHandle);
}

async function collectCandidateHandles(directoryHandle) {
  const handles = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === 'file') {
      if (isArchiveFileName(entry.name) || !IGNORED_IN_FOLDERS.has(getFileExtension(entry.name))) {
        handles.push(entry);
      }
    } else if (entry.kind === 'directory') {
      handles.push(...(await collectCandidateHandles(entry)));
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

// Verifica se il file esiste ancora sul dispositivo. getFile() lancia un
// NotFoundError se il file è stato spostato o cancellato dall'esterno.
export async function fileStillExists(handle) {
  try {
    await handle.getFile();
    return true;
  } catch {
    return false;
  }
}

// La cancellazione fisica (handle.remove()) è disponibile solo su Chromium
// recenti. La rileviamo per offrire l'opzione "elimina anche il file" solo
// quando è davvero possibile.
export function isFileDeletionSupported() {
  return (
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.remove === 'function'
  );
}

// Cancella il file fisico puntato dall'handle. Richiede il permesso in
// scrittura (readwrite), da chiedere durante un gesto utente. Restituisce true
// se cancellato, false se il permesso è negato.
export async function deleteFileFromHandle(handle) {
  const granted = await verifyPermission(handle, 'readwrite');
  if (!granted) return false;
  await handle.remove();
  return true;
}
