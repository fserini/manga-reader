import { exportBackupParts } from './db.js';

// Scrittura del file di backup (Fase 30b). `exportBackupParts` (db.js) produce
// il testo a pezzi; qui si decide dove metterlo.
//
// Due strade, per lo stesso motivo — non tenere mai in memoria il file intero:
// - dove esiste il selettore "Salva con nome" (Chrome su computer), i pezzi
//   vengono scritti direttamente sul file scelto, uno alla volta;
// - altrove (Chrome su Android, Firefox, Safari) si costruisce un Blob
//   *incrementale*: a ogni blocco si crea `new Blob([blobPrecedente, pezzo])`,
//   che il browser non copia, ma concatena per riferimento, e che può
//   tenere su disco invece che in memoria. Poi si scarica come prima.

function backupFileName() {
  return `manga-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

// Restituisce { cancelled: true } se l'utente chiude il selettore di file.
// Va chiamata direttamente da un tocco: il selettore "Salva con nome" si apre
// solo in risposta a un gesto dell'utente, quindi viene richiesto PRIMA di
// iniziare a leggere il database.
export async function saveBackup({ light, onProgress }) {
  if (typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: backupFileName(),
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
    } catch (error) {
      if (error?.name === 'AbortError') return { cancelled: true };
      throw error;
    }
    const writable = await handle.createWritable();
    try {
      for await (const part of exportBackupParts({ light, onProgress })) {
        await writable.write(part);
      }
      await writable.close();
    } catch (error) {
      // Senza abort() resterebbe un file temporaneo a metà.
      await writable.abort().catch(() => {});
      throw error;
    }
    return { cancelled: false };
  }

  let blob = new Blob([]);
  for await (const part of exportBackupParts({ light, onProgress })) {
    blob = new Blob([blob, part], { type: 'application/json' });
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName();
  link.click();
  // Il download parte in modo asincrono: revocare subito l'URL lo può
  // interrompere sui file grandi.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { cancelled: false };
}
