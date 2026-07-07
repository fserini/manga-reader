# Fase 4 — Supporto CBR

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase estende la Fase 3, quindi si dà per letta [`fase3-lettura-cbz.md`](./fase3-lettura-cbz.md) — qui ci si concentra soprattutto su **cosa cambia** e sul concetto di WebAssembly.

---

## 🎯 Obiettivo della fase

Estendere il Lettore, capace finora di leggere solo file **CBZ**, per supportare anche i file **CBR**. Stesso obiettivo della Fase 3 (catena file → immagini → schermo), ma con un formato più complesso da decomprimere.

## 🧩 Perché CBZ e CBR hanno bisogno di librerie diverse

Un CBZ è "solo" uno ZIP rinominato — formato aperto, semplice, `JSZip` lo legge nativamente in puro JavaScript.

Un CBR è invece un archivio **RAR** rinominato. RAR è un formato **proprietario**: le specifiche non sono completamente pubbliche, e implementarne la decompressione da zero in JavaScript sarebbe estremamente complesso. La soluzione adottata (già decisa in `02-analisi-tecnica.md`) è **`libarchive.js`**: non è una libreria scritta in JavaScript, ma un **porting in WebAssembly** della libreria C `libarchive` (la stessa usata da molti tool di decompressione desktop), già in grado di leggere RAR, ZIP, 7-Zip, TAR e altri formati.

### Cos'è il WebAssembly (in breve)

Normalmente il codice che gira nel browser è JavaScript. **WebAssembly (WASM)** è un formato binario alternativo che il browser può eseguire quasi alla velocità di un programma nativo — è pensato per portare nel browser codice scritto in linguaggi come C/C++/Rust senza doverlo riscrivere da zero in JavaScript. Nel nostro caso, la libreria `libarchive` (scritta in C) è stata compilata in un file `.wasm`, che il browser sa eseguire direttamente.

### Perché serve un Web Worker

Eseguire ed elaborare un archivio RAR può richiedere calcoli pesanti. Se questi calcoli avvenissero sul thread principale del browser (lo stesso che gestisce l'interfaccia), l'app si "bloccherebbe" per il tempo dell'estrazione — niente più click, niente più scroll, schermata congelata.

Un **Web Worker** è uno script JavaScript che gira in un thread separato, in background: `libarchive.js` lo usa per eseguire il modulo WASM lontano dal thread principale, così l'interfaccia resta reattiva anche durante l'estrazione. Il nostro codice React non deve gestire il worker direttamente: la libreria lo fa in modo trasparente, noi la usiamo come una normale funzione `async`.

---

## 🛠️ Cosa abbiamo cambiato in `Reader.jsx`

### I file del worker vanno serviti come asset statici

A differenza di `JSZip` (una libreria JavaScript "normale", che Vite include nel bundle dell'app), `libarchive.js` è composta da due parti:

1. Un modulo JS "leggero" che si importa normalmente: `import { Archive } from 'libarchive.js'`
2. Un **worker bundle** + il file **`.wasm`** (circa 1 MB), che devono restare file separati, raggiungibili con una URL — Vite non può "impacchettarli dentro" il resto del codice

Per questo li abbiamo copiati manualmente in `public/libarchive/` (worker-bundle.js + libarchive.wasm — i file "sorgente" restano in `node_modules/libarchive.js/dist/`, questa è una copia usata solo a runtime) e detto alla libreria dove trovarli:

```js
Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });
```

Questa riga sta **fuori** dal componente `Reader`, a livello di modulo: va eseguita una sola volta quando il file viene caricato, non ad ogni rendering.

Nota positiva "di riflesso": essendo dentro `public/`, questi file vengono automaticamente inclusi nel precache del service worker configurato in Fase 2 — significa che, dopo la prima visita, anche la lettura di un CBR funzionerà offline.

### Estrazione CBZ vs CBR: due funzioni, stessa "forma"

Il codice ora ha due funzioni separate, `extractCbzPages(file)` e `extractCbrPages(file)`, ciascuna specializzata per la propria libreria ma con lo stesso "contratto": prendono un file e restituiscono una `Promise` che si risolve in un array di immagini (`Blob`/`File`), già filtrate e ordinate.

```js
const images = isCbr ? await extractCbrPages(file) : await extractCbzPages(file);
```

Questo pattern — funzioni diverse dietro un'interfaccia comune, scelte con un semplice `if`/operatore ternario in base al tipo di file — è quello che permette al resto del componente (creazione degli URL, gestione errori, rendering) di **non sapere né preoccuparsi** di quale libreria abbia effettivamente estratto le pagine.

`extractCbrPages` in dettaglio:

```js
async function extractCbrPages(file) {
  const archive = await Archive.open(file);
  await archive.extractFiles();
  const filesArray = await archive.getFilesArray();

  return filesArray
    .filter(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.path + a.file.name, b.path + b.file.name))
    .map(({ file: entry }) => entry);
}
```

- `Archive.open(file)` avvia il worker e prepara l'archivio per la lettura
- `archive.extractFiles()` decomprime davvero tutti i file al suo interno
- `archive.getFilesArray()` restituisce un array piatto `{ file, path }` per ogni voce — utile perché i CBR, più spesso dei CBZ, hanno le pagine dentro una sottocartella (es. `NomeVolume/pagina01.jpg`): per ordinare correttamente serve considerare `path + nome file`, non il nome file da solo

Come già in Fase 3, viene usato `naturalCompare` (basato su `localeCompare` con `numeric: true`) per evitare che `pagina10` finisca prima di `pagina2`.

### `eslint.config.js`: escludere codice di terze parti dal lint

Copiare `worker-bundle.js` (un file minificato, non scritto da noi) dentro `public/` ha causato un problema collaterale: ESLint ha provato ad analizzarlo come se fosse codice nostro, producendo decine di errori senza senso (variabili minificate a una lettera, ecc.). Soluzione: escluderlo esplicitamente, come già si faceva per la cartella di build `dist`:

```js
globalIgnores(['dist', 'public/libarchive'])
```

Regola generale utile da ricordare: cartelle che contengono codice **copiato**, non scritto a mano, vanno sempre escluse dal linter.

---

## ✅ Come verificare che funzioni

Non disponendo di un vero file RAR proprietario per i test, abbiamo verificato la pipeline con un archivio **TAR** rinominato `.cbr` (formato comunque supportato da `libarchive.js`, utile proprio per validare l'estrazione senza dipendere da software RAR a pagamento):

- 3 pagine (`page1/page2/page10`) estratte e mostrate nell'ordine numerico corretto, nessun errore in console, nessuna richiesta di rete fallita
- Rifatto anche il test della Fase 3 con un CBZ, per assicurarsi che il refactor (estrarre la logica in due funzioni parallele) non avesse rotto nulla — confermato tutto invariato

Un dettaglio emerso durante il test: con un file **CBR corrotto** (bytes casuali rinominati `.cbr`), `libarchive.js` non genera un errore come farebbe JSZip con uno ZIP non valido — restituisce semplicemente **zero file**. Il nostro codice lo intercetta comunque (mostra "Nessuna immagine trovata in questo file"), ma il messaggio è leggermente meno preciso rispetto al caso CBZ ("non sembra un CBR valido"). Non è un problema bloccante per una fase di proof-of-concept: una gestione errori più fine è comunque prevista più avanti, alla Fase 15.

Il test più affidabile resta comunque provare con un **vero file `.cbr`** (un fumetto reale, o un file RAR rinominato) — fatto: testato con un capitolo reale (28 pagine), tutte estratte e mostrate nell'ordine corretto.

### ⚠️ Nota nota (non bloccante): impaginazione delle pagine su schermo

Durante il test con il capitolo reale, su alcune combinazioni di viewport/browser le pagine sono apparse **affiancate a coppie** invece che impilate una sotto l'altra. È stato applicato un fix (`display: block` esplicito sulle `<img>`, invece di affidarsi al solo attributo HTML `width="100%"`, che da solo non basta perché il tag `<img>` di default è `display: inline`), verificato corretto in un ambiente di test ma non riprodotto in modo consistente in ogni condizione.

Non abbiamo investigato oltre, per una ragione precisa: l'intera logica di **come le pagine vengono disposte a schermo** verrà riscritta da zero nella Fase 5, che introduce le vere modalità di lettura (pagina singola, doppia pagina/spread, scroll verticale continuo) con un selettore dedicato — l'attuale "sequenza verticale semplice" è comunque temporanea. Ha più senso progettare bene il layout in quella fase, con in mente tutte e tre le modalità, piuttosto che inseguire ora un dettaglio visivo destinato a essere sostituito. Da tenere presente come primo punto da verificare in Fase 5.

---

## 🔜 Prossimi passi

Il Lettore ora sa leggere entrambi i formati richiesti dal progetto, ma resta un proof-of-concept: una sola modalità di visualizzazione (con un layout ancora da consolidare, vedi nota sopra), nessun collegamento a una libreria persistente. La Fase 5 introdurrà le vere modalità di lettura (pagina singola, doppia pagina, scroll continuo).
