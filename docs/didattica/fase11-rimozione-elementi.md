# Fase 11 — Rimozione elementi

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase introduce le operazioni **distruttive** (cancellare dati e file) e come renderle sicure: conferma esplicita, scelte chiare, e un occhio di riguardo per l'irreversibile.

---

## 🎯 Obiettivo della fase

Aggiungere la possibilità di **rimuovere** serie, volumi e capitoli dalla libreria, con:

- un **popup di conferma sempre presente** (niente cancellazioni con un tocco solo);
- la scelta tra *rimuovere solo dalla libreria* (il file resta sul dispositivo) o *eliminare anche il file fisico*;
- la **rimozione automatica** dei riferimenti a file che non esistono più (spostati o cancellati da fuori l'app).

---

## 🧹 Rimozione a cascata nel database

La libreria è gerarchica: una serie contiene volumi, che contengono capitoli. Rimuovere una serie deve rimuovere anche tutto ciò che sta sotto — altrimenti resterebbero volumi e capitoli "orfani", puntatori a un genitore che non esiste più. In [`src/db.js`](../../src/db.js):

```js
export async function removeSeries(seriesId) {
  const chapters = await db.chapters.where('seriesId').equals(seriesId).toArray();
  await db.readingProgress.bulkDelete(chapters.map((chapter) => chapter.id));
  await db.chapters.where('seriesId').equals(seriesId).delete();
  await db.volumes.where('seriesId').equals(seriesId).delete();
  await db.series.delete(seriesId);
}
```

L'ordine conta: prima si cancellano i "figli" (progressi di lettura, poi capitoli, poi volumi) e infine la serie stessa. Nota anche `db.readingProgress` — il progresso di lettura di un capitolo è un dato collegato che va ripulito insieme, altrimenti resterebbe una riga di progresso che punta a un capitolo inesistente. È lo stesso ragionamento di `removeChapter`, che cancella il capitolo **e** il suo progresso.

Questa è la parte "solo database": tocca solo i *riferimenti*, mai i file veri e propri.

---

## 🗑️ Cancellare il file fisico: potere e responsabilità

Cancellare davvero un file dal dispositivo è un'operazione **irreversibile** e va oltre il database. Usa un metodo della File System Access API, `handle.remove()`, con due accortezze importanti in [`src/fileAccess.js`](../../src/fileAccess.js):

```js
export function isFileDeletionSupported() {
  return (
    typeof FileSystemFileHandle !== 'undefined' &&
    typeof FileSystemFileHandle.prototype.remove === 'function'
  );
}

export async function deleteFileFromHandle(handle) {
  const granted = await verifyPermission(handle, 'readwrite');
  if (!granted) return false;
  await handle.remove();
  return true;
}
```

Due punti chiave:

- **Feature detection**: `handle.remove()` non esiste su tutti i browser (è recente, solo Chromium aggiornati). Invece di dare per scontato che ci sia, la controlliamo (`isFileDeletionSupported`): se manca, l'app **non mostra nemmeno** l'opzione "elimina anche il file", offrendo solo la rimozione dalla libreria. Meglio nascondere una funzione che non funziona, che mostrarla e fallire.
- **Permesso in scrittura**: leggere un file richiede il permesso `read`; cancellarlo richiede `readwrite`, un permesso più forte, che va richiesto a parte — e, come sempre nella File System Access API, **durante un gesto dell'utente** (qui: il click sul pulsante di conferma). Se l'utente lo nega, non cancelliamo nulla e lo segnaliamo.

### Un dialog "presentazionale"

Il popup di conferma ([`src/components/DeleteDialog.jsx`](../../src/components/DeleteDialog.jsx)) è un componente **puramente presentazionale**: non sa *cosa* sta per essere cancellato né *come* — riceve un'etichetta, una nota e tre callback (`onCancel`, `onRemoveFromLibrary`, `onDeleteFiles`). Tutta la logica vera (raccogliere gli handle, cancellare i file, aggiornare il database) sta nel Catalogo. È lo stesso principio del form di Fase 9: separare "come appare" da "cosa fa" rende entrambi più semplici e il dialog riutilizzabile per serie, volumi e capitoli senza modifiche.

Il pulsante di eliminazione fisica usa lo stile "pericolo" (rosso) e appare **solo** se `isFileDeletionSupported()` è vero.

---

## 🔄 L'ordine delle operazioni nella cancellazione fisica

Quando l'utente sceglie "elimina anche il file", nel Catalogo l'ordine è preciso:

```js
if (deletePhysical) {
  const handles = await collectHandles(target); // 1. raccogli PRIMA gli handle
  for (const handle of handles) {
    try {
      const deleted = await deleteFileFromHandle(handle);
      if (!deleted) filesFailed += 1;
    } catch {
      filesFailed += 1; // 2. best-effort: un fallimento non blocca gli altri
    }
  }
}
await removeFromDb(target);   // 3. solo ORA rimuovi dal database
```

1. **Prima** si raccolgono gli handle dei file, perché stanno *dentro* i capitoli nel database: se cancellassimo prima i capitoli, perderemmo i riferimenti ai file da eliminare.
2. Ogni cancellazione è avvolta in `try/catch` e contata: se un file non si riesce a eliminare (permesso negato, già sparito...), gli altri procedono comunque — è una logica **best-effort**. Alla fine si informa l'utente di quanti file non è stato possibile eliminare.
3. Solo dopo aver tentato le cancellazioni fisiche si rimuove il riferimento dal database.

*(Un limite pratico della piattaforma: cancellando molti file — es. un'intera serie — il browser può chiedere il permesso `readwrite` **per ciascun file**, perché ogni handle è indipendente. Per la rimozione di un singolo capitolo, invece, è un solo permesso.)*

---

## 👻 Rimozione automatica dei riferimenti "morti"

L'app tiene solo un *riferimento* (handle) ai file, non una copia. Se l'utente sposta o cancella un file da fuori (dal file manager del tablet), quel riferimento diventa "morto": punta a un file che non c'è più. Invece di far fallire misteriosamente l'apertura, il Catalogo se ne accorge e pulisce da sé:

```js
if (!(await fileStillExists(chapter.handle))) {
  await removeChapter(chapter.id);
  await reloadCurrentLevel();
  setNotice('Il file non è più disponibile ed è stato rimosso dalla libreria.');
  return;
}
```

`fileStillExists` prova a leggere il file: se `getFile()` lancia un errore (tipicamente `NotFoundError`), il file non c'è più. In quel caso rimuoviamo automaticamente il riferimento (nessuna conferma: non c'è nulla di distruttivo da confermare — il file è già sparito, stiamo solo pulendo un puntatore rotto) e avvisiamo con un messaggio.

Questo controllo avviene quando si tocca il capitolo, appena prima di aprirlo: è il momento naturale in cui scopriamo se il file è ancora lì.

---

## 🔘 Un dettaglio di HTML: niente pulsanti dentro pulsanti

Fino a Fase 10, ogni card del catalogo era **un unico pulsante** (tocchi ovunque → apri). Ora serve un secondo pulsante — il cestino 🗑 — dentro la stessa card. Ma **un pulsante dentro un altro pulsante è HTML non valido** e si comporta in modo imprevedibile.

La soluzione è ristrutturare la card: non più un pulsante, ma un *contenitore* (`<li>`) con **due pulsanti affiancati** — l'area principale cliccabile (`catalog-card-main`, apre/naviga) e il cestino (`catalog-card-delete`, in alto a destra). Il cestino è posizionato "sopra" l'angolo della copertina con `position: absolute`. Così i due gesti (aprire vs eliminare) non si sovrappongono e restano HTML corretto.

---

## ✅ Come verificare che funzioni

Testato con dati di prova nel database (i file veri non sono automatizzabili qui):

- **Cascata database**: `removeChapter` elimina anche il progresso di lettura collegato; `removeSeries` elimina a cascata volumi e capitoli (contati prima e dopo: tutto azzerato correttamente).
- **Dialog di conferma**: si apre con l'etichetta giusta ("Rimuovere la serie «One Piece»?", "Rimuovere il capitolo 1?") e mostra l'opzione "elimina anche il file" perché il browser di test (Chromium) la supporta.
- **Rimozione "solo dalla libreria"**: rimuove la voce dal database e la lista si aggiorna, senza toccare i file.
- **Mattoni dell'accesso ai file**: verificati passando handle simulati a runtime — `fileStillExists` restituisce `false` se `getFile` fallisce (file mancante) e `true` se il file c'è; `verifyPermission` restituisce `true` sia quando il permesso è già concesso sia quando viene concesso su richiesta.

**Da verificare sul dispositivo/browser reale (non automatizzabile qui):** l'eliminazione fisica di un file vero (permesso `readwrite` → `handle.remove()`) e l'auto-rimozione end-to-end quando un file viene spostato/cancellato dall'esterno. Con handle "finti" nel database non si può arrivare fino in fondo, perché un handle realistico ha bisogno di metodi (`queryPermission`, `getFile`, `remove`) che IndexedDB non è in grado di salvare — quindi il round-trip completo richiede il selettore file nativo e file reali.

---

## 🔜 Prossimi passi

La gestione della libreria è ora completa: importare, categorizzare, sfogliare, leggere e **rimuovere**. La **Fase 12** aggiunge il salvataggio dei progressi di lettura — così riaprendo un capitolo si riparte dall'ultima pagina letta — insieme al segnalibro manuale e alle sezioni "in corso di lettura" e "ultimi letti".
