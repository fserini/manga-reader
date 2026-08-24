# Fase 8 — Import multiplo e sezione "Da categorizzare"

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa è la prima fase in cui il "motore dati" della Fase 7 incontra una vera interfaccia: importiamo file dal dispositivo e li mostriamo nella Libreria.

---

## 🎯 Obiettivo della fase

Fino alla Fase 7 l'app sapeva salvare dati (Serie, Volumi, Capitoli) ma nessuna schermata li usava, e — dettaglio cruciale — un capitolo salvato non aveva alcun **collegamento al file vero**: dopo un reload non c'era modo di riaprire quel CBZ/CBR. Il Lettore, dalla Fase 3, apre un file "una tantum" e lo dimentica appena si ricarica la pagina.

Questa fase introduce l'**import**: scegliere uno o più file (o un'intera cartella), salvarli in libreria come capitoli "da categorizzare", ed evitare di importare due volte lo stesso file. Non assegniamo ancora Serie/Volume/Capitolo (è la Fase 9): qui costruiamo la "porta d'ingresso" della libreria.

---

## 📂 Il problema di fondo: come "ricordare" un file

Un browser, per ragioni di sicurezza, non può curiosare liberamente nei file del tuo dispositivo. Storicamente l'unico modo per leggere un file era il classico `<input type="file">`: l'utente sceglie un file, il browser te ne dà il contenuto **quella volta sola**. Ricaricata la pagina, quel collegamento è perso — dovresti riscegliere il file.

Per una libreria che deve sopravvivere ai reload servono due possibili strade, molto diverse:

1. **Copiare i byte del file dentro il database del browser.** L'app diventa un contenitore autonomo. Semplice, ma una libreria manga può pesare svariati GB: duplicarla tutta dentro IndexedDB è pesante e rischia di sforare lo spazio disponibile.
2. **Salvare solo un "riferimento" al file originale**, lasciando i byte dove sono. L'app resta un *visore* sui tuoi file. Nessuna duplicazione, ma serve un'API più recente del browser.

Abbiamo scelto la **seconda** strada. La motivazione completa è in [`docs/decisions/ADR-001-accesso-file.md`](../decisions/ADR-001-accesso-file.md): in breve, è coerente con quello che l'app dovrà fare più avanti (Fase 11: accorgersi se un file è stato spostato/cancellato, o eliminarlo davvero dal dispositivo) — cose che hanno senso solo se l'app punta ai file veri, non a delle copie.

---

## 🔑 La File System Access API e il concetto di "handle"

La **File System Access API** è la funzione moderna del browser che permette questa seconda strada. Il pezzo chiave è l'**handle** (letteralmente "maniglia"): non è il file, e non è il suo contenuto — è un *oggetto-riferimento* che dice "il file che l'utente ha scelto lì". Un po' come un segnaposto in una libreria: non è il libro, ma sa esattamente dove ritrovarlo.

Il bello: un handle è **salvabile in IndexedDB**. IndexedDB usa un meccanismo chiamato *structured clone* per salvare oggetti, e gli handle sono fatti apposta per essere clonati così. Quindi possiamo mettere l'handle nella riga del capitolo ([`src/db.js`](../../src/db.js)) e ritrovarlo dopo un reload, pronto per riaprire il file.

Un'unica avvertenza importante sui **permessi**: quando ricarichi la pagina e rileggi un handle da IndexedDB, il permesso di lettura torna "da chiedere". Il browser lo richiede di nuovo, e la richiesta funziona **solo durante un gesto dell'utente** (tipicamente un click) — non si può chiedere il permesso "di nascosto" a pagina appena caricata. Questo dettaglio non ci tocca ancora qui (importiamo con un click, quindi il permesso c'è già), ma diventerà rilevante quando in Fase 10 collegheremo la Libreria al Lettore.

Tutto questo è isolato nel nuovo file [`src/fileAccess.js`](../../src/fileAccess.js): la Libreria chiama funzioni con nomi chiari (`pickFiles`, `pickDirectory`, `readFileFromHandle`) senza dover conoscere i dettagli dell'API.

### Non è disponibile ovunque

Questa API esiste solo sui browser basati su Chromium (Chrome, Edge — anche su Android da Chrome 132, inizio 2025). Su Firefox e Safari non c'è. Per questo `isFileSystemAccessSupported()` controlla la sua presenza, e se manca la Libreria mostra un messaggio chiaro invece di rompersi. Il target del progetto è comunque Chrome su Android, quindi in uso reale è coperto.

---

## 📥 Import di più file e di una cartella

Due modi di importare, entrambi in [`src/fileAccess.js`](../../src/fileAccess.js):

- **File** — `showOpenFilePicker({ multiple: true })` apre il selettore file e permette di sceglierne diversi in una volta; restituisce un handle per ciascuno.
- **Cartella** — `showDirectoryPicker()` fa scegliere una cartella. Da lì la percorriamo **ricorsivamente** (`collectArchiveHandles`), raccogliendo gli handle di tutti i `.cbz`/`.cbr`, comprese le sottocartelle:

```js
for await (const entry of directoryHandle.values()) {
  if (entry.kind === 'file') {
    if (isArchiveFileName(entry.name)) handles.push(entry);
  } else if (entry.kind === 'directory') {
    handles.push(...(await collectArchiveHandles(entry)));
  }
}
```

Nota il `for await`: percorrere una cartella è un'operazione asincrona (il browser fornisce le voci un po' alla volta), e `for await` è il modo di scorrere un elenco di cose che arrivano nel tempo.

Filtriamo comunque per estensione **dopo** aver ricevuto i file, anche per il selettore file: su Android il filtro del picker viene a volte ignorato, quindi non ci fidiamo e ricontrolliamo noi.

---

## 🚫 Bloccare i duplicati (con un indice)

Il requisito: se un file sembra già presente in libreria, l'import di quel file va **bloccato**. Lo riconosciamo dal nome file. In [`src/db.js`](../../src/db.js):

```js
export async function chapterExistsByFileName(fileName) {
  const count = await db.chapters.where('fileName').equals(fileName).count();
  return count > 0;
}
```

Qui torna utile un concetto già visto nella Fase 7: gli **indici**. Abbiamo aggiunto `fileName` tra gli indici della tabella `chapters` (facendo salire lo schema alla `version(2)`), proprio perché ora ci **cerchiamo sopra**. `where('fileName').equals(...)` è una ricerca svolta direttamente dal database usando quell'indice — più efficiente che leggere tutte le righe e confrontarle una a una in JavaScript. È l'esempio concreto della regola "si indicizza solo ciò su cui si filtra davvero".

Cambiare lo schema di un database che potrebbe già contenere dati richiede attenzione, ma qui è indolore: aggiungere un indice non tocca i dati esistenti, e Dexie ri-indicizza da solo le righe già presenti durante l'aggiornamento. Nessuna funzione di migrazione necessaria.

Il ciclo di import nella Libreria mette tutto insieme e tiene un piccolo conteggio, così l'utente riceve un riepilogo ("Importati: 3 · Duplicati saltati: 1 · Ignorati: 0"):

```js
for (const handle of handles) {
  if (!isArchiveFileName(handle.name)) { ignored += 1; continue; }
  if (await chapterExistsByFileName(handle.name)) { duplicates += 1; continue; }
  await importChapter({ fileName: handle.name, handle });
  imported += 1;
}
```

---

## 🖼️ La Libreria: invito a vuoto e sezione "Da categorizzare"

La pagina [`src/pages/Library.jsx`](../../src/pages/Library.jsx), finora un semplice segnaposto, diventa la vera home dell'app. Ha tre "stati" visivi:

- **Libreria vuota** (nessun capitolo): al posto di un pulsantino defilato, un grande invito al centro dello schermo — "tocca per importare" — che apre subito il selettore file. È la scelta dell'analisi funzionale: quando non c'è niente, la cosa più utile da fare (importare) dev'essere quella più evidente.
- **Con contenuti:** i pulsanti "Importa file" / "Importa cartella" in alto, e sotto la sezione **"Da categorizzare"** con l'elenco dei capitoli importati ma non ancora assegnati a una serie.
- **Browser non supportato:** il messaggio di avviso di cui sopra.

Per ora la lista mostra solo il nome del file. Le **miniature** (l'anteprima della prima pagina) e la **categorizzazione** vera e propria arriveranno nelle fasi successive (rispettivamente Fase 10 e Fase 9): questa fase costruisce l'ossatura su cui poggeranno.

### Un dettaglio React: `useCallback` e `useEffect`

Al caricamento della pagina dobbiamo leggere i dati dal database (i capitoli da categorizzare + il conteggio totale). In React questo "fai qualcosa quando la pagina appare" si esprime con `useEffect`. La funzione che ricarica i dati (`refresh`) serve sia all'avvio sia dopo ogni import, quindi la definiamo una volta con `useCallback` (che evita di ricrearla a ogni render) e la riusiamo in entrambi i punti.

---

## ✅ Come verificare che funzioni

In sviluppo si usa Chrome desktop (l'API c'è, e `localhost` è considerato un contesto sicuro). Con `npm run dev`:

- Libreria vuota → compare l'invito centrale; il tap apre il selettore.
- Import di 2-3 file CBZ/CBR → compaiono in "Da categorizzare"; il riepilogo conta giusto.
- Re-import dello stesso file → **bloccato** come duplicato (non compare due volte).
- Import di una **cartella** con archivi annidati → vengono raccolti tutti.
- **Reload completo della pagina** → i capitoli sono ancora lì: l'handle è stato davvero salvato, non era solo memoria volatile.
- Prova che l'handle è "vivo": nella stessa sessione, rileggere il file da un handle salvato restituisce i suoi byte (round-trip completo file → riferimento salvato → file di nuovo leggibile).

---

## 🔜 Prossimi passi

Ora che i file entrano in libreria come capitoli "da categorizzare", la **Fase 9** costruirà il form per assegnare loro Serie/Volume/Capitolo. La **Fase 10** userà gli handle salvati qui per aprire un capitolo direttamente dal Lettore (ed è lì che gestiremo la riconferma del permesso al primo click di ogni sessione).
