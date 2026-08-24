# Fase 16 — Backup e ripristino dati

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase mette in fila alcune competenze già viste (Dexie, `Blob`, form controllati) attorno a un problema nuovo: come "mettere in una scatola" tutta la libreria e come rimetterla al suo posto, sapendo che un pezzo — l'accesso ai file — semplicemente non può stare nella scatola.

---

## 🎯 Obiettivo della fase

Esportare l'intera libreria (serie, volumi, capitoli, progressi di lettura, preferiti) in un file che l'utente può conservare o spostare su un altro dispositivo, e poterla poi ripristinare da quel file.

---

## 🧩 Il vincolo di partenza: cosa NON si può esportare

Dalla Fase 8 in poi, ogni capitolo porta con sé un `handle` (`FileSystemFileHandle`): un riferimento diretto al file CBZ/CBR sul dispositivo. È comodissimo — evita di duplicare i byte del fumetto nel database — ma ha un limite intrinseco: **un handle ha senso solo nel browser e nel dispositivo in cui è stato creato**. Non esiste un modo per trasformarlo in qualcosa che, salvato su un altro telefono o dopo una reinstallazione, punti di nuovo allo stesso file.

Questo significa che un backup può contenere *tutto tranne* i collegamenti ai file fisici. È un limite della piattaforma, non una scelta arbitraria — e va progettato tenendolo bene a mente fin dall'inizio, non scoperto a metà lavoro.

---

## 🖼️ Un problema pratico: JSON non sa cosa sia un `Blob`

Le miniature (copertine di serie/volumi, anteprime dei capitoli) sono salvate nel database come `Blob` — dati binari. JSON, il formato di testo scelto per il file di backup (leggibile, portabile, apribile da chiunque), non ha alcun modo di rappresentare byte grezzi al suo interno: sa solo scrivere numeri, stringhe, booleani, array e oggetti.

La soluzione è una conversione **avanti e indietro**, usando il formato **data URL** (una stringa di testo che codifica dati binari in base64, con un prefisso che ne descrive il tipo — lo stesso formato usato spesso per incollare "al volo" una piccola immagine dentro un URL):

```js
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}
```

`FileReader` è un'API più datata (pre-`Promise`) per leggere `Blob`: da qui l'incapsulamento manuale in `new Promise(...)`, uno schema già visto altrove nel progetto per "impacchettare" API a callback dentro un'interfaccia `async/await`. Il percorso di ritorno è più elegante: `fetch()` sa leggere direttamente un data URL (li tratta come se fossero una risorsa di rete) e restituirne il contenuto come `Blob` con `.blob()` — un piccolo trucco pratico più che una vera richiesta di rete.

---

## 📦 Esportare: leggere tutto, trasformare, restituire un oggetto

```js
export async function exportBackup() {
  const [seriesRows, volumeRows, chapterRows, progressRows] = await Promise.all([
    db.series.toArray(),
    db.volumes.toArray(),
    db.chapters.toArray(),
    db.readingProgress.toArray(),
  ]);

  const chapters = await Promise.all(
    chapterRows.map(async ({ handle, ...row }) => ({
      ...row,
      thumbnail: row.thumbnail ? await blobToDataUrl(row.thumbnail) : null,
    })),
  );
  // ... stesso trattamento per series e volumes ...

  return { version: 1, exportedAt: Date.now(), series, volumes, chapters, readingProgress: progressRows };
}
```

Il dettaglio più importante è `({ handle, ...row })`: la **destrutturazione con resto**, già incontrata per separare "un campo" dal "tutto il resto" di un oggetto. Qui si usa per fare l'opposto di quanto visto finora: non per *usare* il campo estratto, ma per **escluderlo deliberatamente** dal risultato. `handle` finisce in una variabile che non viene mai letta (e infatti richiede un commento per spiegare a chi legge — e al linter — che è voluto), mentre `row` contiene tutto il resto, pronto per essere restituito senza quel campo.

Il risultato è un semplice oggetto JavaScript, pronto per `JSON.stringify(...)`. Il file scaricato non è altro che questo testo, incapsulato in un `Blob` e offerto in download tramite un link `<a download>` creato al volo:

```js
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `manga-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
link.click();
URL.revokeObjectURL(url);
```

Questo è il modo idiomatico di "scaricare un file generato al volo" in una pagina web: si crea un elemento `<a>` **mai inserito nella pagina**, gli si dà un URL e l'attributo `download` (che dice al browser "salvalo, non navigare lì"), e si simula un click su di esso via JavaScript.

---

## ♻️ Ripristinare: sostituire tutto, o niente

Il ripristino è un'operazione radicale: **sostituisce l'intera libreria attuale**. Per questo va trattata come le altre operazioni distruttive del progetto (la rimozione di Fase 11): mai senza una conferma esplicita, con un testo chiaro su cosa sta per succedere.

Tecnicamente, "sostituire tutto" significa: svuotare le quattro tabelle e ripopolarle con i dati del backup. Fatto così, senza precauzioni, un errore a metà (es. la connessione al browser che si interrompe) lascerebbe la libreria in uno stato incoerente — alcune tabelle già svuotate, altre no. Dexie offre le **transazioni** proprio per questo:

```js
await db.transaction('rw', db.series, db.volumes, db.chapters, db.readingProgress, async () => {
  await Promise.all([db.series.clear(), db.volumes.clear(), db.chapters.clear(), db.readingProgress.clear()]);
  await Promise.all([
    db.series.bulkAdd(series),
    db.volumes.bulkAdd(volumes),
    db.chapters.bulkAdd(chapters),
    db.readingProgress.bulkAdd(backup.readingProgress ?? []),
  ]);
});
```

`'rw'` dichiara una transazione in lettura-scrittura sulle quattro tabelle elencate. La garanzia di una transazione è **tutto o niente**: se una qualunque delle operazioni al suo interno fallisce, Dexie annulla automaticamente anche quelle già eseguite — non esiste uno stato "a metà" osservabile dall'esterno.

### Un dettaglio che poteva rompere tutto: gli id

Le righe del backup portano con sé i loro `id` originali (auto-incrementali). `bulkAdd` li rispetta invece di generarne di nuovi — **fondamentale**, perché è proprio grazie a quegli id che un volume "sa" a quale serie appartiene (`volume.seriesId`) e un capitolo a quale volume (`chapter.volumeId`): se il ripristino generasse id nuovi, tutti questi collegamenti andrebbero persi.

Resta una domanda: dopo aver ripristinato capitoli con id fino, poniamo, a 47, cosa succede alla *prossima* serie aggiunta con `addSeries(...)` (che chiede a Dexie un id "automatico")? Si rischia una collisione con un id già usato dal ripristino? La risposta, verificata anche testando dal vivo, è no: lo standard IndexedDB prevede che, quando si inserisce esplicitamente una riga con una chiave numerica, il generatore automatico della tabella si aggiorni per non riusare mai più quel numero (e quelli sotto). Un dettaglio della piattaforma di cui non ci si accorge quasi mai, ma che qui è esattamente il comportamento di cui c'era bisogno.

---

## 🔗 Il pezzo mancante: ricollegare i capitoli dopo un ripristino

Un capitolo appena ripristinato non ha `handle`: esiste nella libreria (si vede nel catalogo, ha una miniatura, un progresso di lettura) ma **non si può ancora aprire**. L'unico modo per tornare a leggerlo è re-importare lo stesso file — ma l'import esistente (Fase 8) blocca qualunque file con un nome già presente in libreria, considerandolo un duplicato. Con quella regola, un capitolo ripristinato resterebbe per sempre "orfano".

La correzione distingue due situazioni diverse dietro lo stesso "nome file già presente":

```js
const existing = await getChapterByFileName(handle.name);
if (existing && existing.handle) {
  duplicates += 1;      // c'è già, ed è già leggibile: è un vero duplicato
  continue;
}
// ...
if (existing) {
  await setChapterHandle(existing.id, handle);  // c'era, ma senza handle: si ricollega
  relinked += 1;
  continue;
}
```

Non un semplice "esiste sì/no" (come faceva la vecchia `chapterExistsByFileName`, ora sostituita da `getChapterByFileName`, che restituisce la riga intera anziché un booleano — serve sapere *se ha già un handle*, non solo se esiste), ma tre esiti possibili: non esiste (si importa da zero), esiste già con un handle (vero duplicato, si scarta), esiste senza handle (si ricollega). Il riepilogo dell'import in Libreria mostra ora anche quanti capitoli sono stati ricollegati, accanto a importati/duplicati/corrotti/ignorati.

---

## ✅ Come verificare che funzioni

Verificato con dati completi (serie, volumi, capitoli, miniature, progresso, segnalibro manuale, preferiti):

- **Esportazione**: nessun campo `handle` nel risultato; le miniature diventano stringhe (data URL); tutte le righe presenti.
- **Round-trip completo**: esportato, cancellato tutto il database (per simulare un dispositivo pulito), ripristinato — titolo, miniature (tornate `Blob` veri), preferiti, progresso e segnalibro manuale tutti corretti; i collegamenti serie→volume→capitolo→progresso restano coerenti (stessi id).
- **Nessuna collisione di id**: dopo un ripristino, una nuova serie aggiunta normalmente riceve un id mai usato prima, né dai dati ripristinati né da quelli precedenti.
- **Ricollegamento**: un capitolo ripristinato (senza handle) re-importato con lo stesso nome file viene riconosciuto e ricollegato (stesso id, quindi stesso progresso/preferito), non duplicato; un capitolo che ha *già* un handle valido resta correttamente trattato come duplicato.
- **Interfaccia**: esportazione funzionante dal pulsante; un file non-JSON o JSON non riconoscibile come backup mostra un errore chiaro; un backup valido apre il dialog di conferma; "Annulla" non tocca nulla; confermando, la libreria precedente viene davvero sostituita con quella del file.
- Nessun errore in console in nessuno degli scenari sopra.

---

## 🔜 Prossimi passi

Con questa fase si chiude la parte "Dati" della roadmap. Le prossime fasi sono trasversali: **Fase 17** introduce il tema chiaro/scuro con selezione manuale (finora l'app seguiva solo la preferenza di sistema), poi lingua, rifinitura e infine il deploy pubblico.
