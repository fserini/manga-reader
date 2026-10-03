# Fase 28b — Leggere i PDF

> Seconda metà della Fase 28 (la [28a](fase28a-nuovi-formati-archivio.md) aggiunse ZIP, RAR e 7z). Il PDF è di un altro tipo: non è una cartella di immagini già pronte, è un documento da **disegnare** pagina per pagina.

---

## 1. Perché il PDF è diverso

Un CBZ/CBR/RAR/7z contiene file immagine: si estraggono, si mostrano, fine. Un PDF contiene istruzioni di disegno (e, nei volumi scansionati, immagini dentro pagine): per ottenere un'immagine da mostrare bisogna **renderizzare** la pagina su un `canvas`. Costa tempo (decine di millisecondi per pagina) e memoria (un canvas da 1400×2000 pixel sono ~11 MB), e un volume ha 200 pagine. Disegnarle tutte all'apertura vorrebbe dire attendere a lungo e riempire la memoria: su un tablet, è la strada più breve verso un'app che si chiude.

La soluzione è **disegnare solo ciò che serve, quando serve**.

## 2. La libreria: pdf.js, caricata a richiesta

Per leggere i PDF si usa **pdf.js** (`pdfjs-dist`, quella di Firefox). È pesante (~490 KB di libreria + 1,3 MB di *worker*, il processo separato che fa il lavoro vero), quindi non entra nel bundle principale: `loadPdfjs()` la importa con `import()` dinamico la **prima volta** che si apre un PDF. Chi legge solo CBZ non la scarica mai.

Scelte tecniche:

- **Versione "legacy"** (`pdfjs-dist/legacy/...`): funziona anche sui browser meno recenti. Molti tablet Android tengono Chrome vecchio a lungo.
- **Il worker è un file `.mjs`**: Vite lo copia in `dist/` con l'import `?url`, ma il service worker dell'app (che rende l'app utilizzabile offline) per impostazione predefinita mette in cache solo `js`, `css` e `html`. Senza un intervento, il PDF non si sarebbe aperto offline: `vite.config.js` aggiunge `mjs` ai `globPatterns` del precaching (verificato nel manifest generato: libreria e worker ci sono; non provato offline su un dispositivo).

## 3. Riconoscerlo e validarlo

- **`detectReader`** legge ora i primi 1024 byte e cerca `%PDF-`: la specifica ammette qualche byte prima dell'intestazione. L'ordine resta: prima le firme di ZIP/RAR/7z, poi il PDF, poi il ripiego sull'estensione. Un PDF rinominato `.cbz` si apre comunque come PDF.
- **`validatePdf`** (all'import) apre il documento senza disegnare nulla: deve avere almeno una pagina e non chiedere password. Gli errori di pdf.js diventano i soliti motivi — `encrypted` (`PasswordException`), `timeout` (30 secondi sull'apertura, come per RAR/7z), `invalid` — quindi gli avvisi esistenti in Libreria e nel Lettore funzionano senza modifiche.
- `ArchiveError` è passata in un file suo (`archiveError.js`): serve sia a `comicFile.js` sia a `pdfPages.js`, e due moduli che si importano a vicenda sono un guaio.
- **Il PDF è tra i formati accettati** (`ARCHIVE_EXTENSIONS`), quindi compare nei testi "formati supportati" e nel menu "+"; spariscono invece le note "il PDF non è ancora supportato" (la chiave `pdfSoon` è stata tolta).

## 4. Pagine "pigre"

Il Lettore finora riceveva, per ogni pagina, un `Blob` pronto. Per un PDF riceve un oggetto **`{ ratio, load }`**:

- `ratio` (larghezza/altezza), noto senza disegnare, serve a tenere il posto alla pagina;
- `load()` la disegna e restituisce un `Blob` JPEG.

`openChapterPages(file)` è il nuovo punto d'ingresso unico del Lettore, per ogni formato: restituisce `{ groups, dispose }`. Per gli archivi, `groups` contiene Blob e `dispose` non fa nulla; per i PDF contiene pagine pigre, e `dispose` chiude il documento e il suo worker (il Lettore lo chiama lasciando il capitolo).

### Come si disegna (`pdfPages.js`)

- **Risoluzione**: lato lungo di 2.000 pixel per una pagina normale; per una doppia pagina, 2.800 di larghezza. Abbastanza per leggere e per lo zoom, senza canvas enormi. Sfondo bianco forzato (un PDF può essere trasparente, e in JPEG diventerebbe nero). Poi `canvas.width = 0` libera subito la memoria del canvas.
- **Doppie pagine**: come per le immagini degli archivi, una pagina più larga che alta si divide in due metà. Per saperlo servono le dimensioni di tutte le pagine: si leggono (senza disegnare) a gruppi di 25 all'apertura, ~0,3 s per un volume da 40 o 400 pagine.
- **Cache delle ultime 8 pagine**: tornare indietro di una pagina non la ridisegna. Si memorizza la *promessa* e non il risultato, così due richieste della stessa pagina (le due metà di una doppia, o il precaricamento) condividono un solo disegno.
- **Precaricamento**: dopo aver disegnato una pagina, si prepara la successiva in background. Nella lettura sequenziale la pagina dopo è già pronta (0 ms).

### Come le mostra il Lettore (`LazyPage`)

- **Singola/doppia pagina**: serve subito quella mostrata; finché non è pronta, un riquadro vuoto (`reader-page-loading`).
- **Scroll continuo**: un contenitore per pagina, con le sue proporzioni (`aspect-ratio`), così lo scorrimento non salta quando le immagini arrivano. Un `IntersectionObserver` con un margine di circa un schermo e mezzo carica la pagina quando sta per entrare nella vista e la **rilascia** quando se ne va lontano (revoca dell'URL oggetto). In un volume da 400 pagine, scorrendo da cima a fondo, c'erano al massimo **4 immagini nel DOM** alla volta.
- La miniatura (copertina) viene dalla prima pagina, disegnata la prima volta che il capitolo si apre, come per gli altri formati.

## 5. Un errore trovato per strada (non c'entra col PDF)

Provando il passaggio tra due capitoli *dentro* il Lettore (come fa il pulsante "Capitolo successivo"), il secondo capitolo si apriva a pagina 11 invece che alla prima. Causa: passando da un capitolo all'altro il componente è lo stesso, e per un istante `chapterId` è già il nuovo mentre pagine e indice sono ancora del vecchio; l'effetto che salva il progresso scriveva la pagina del vecchio capitolo come progresso del nuovo, che poi veniva "ripristinato" a metà. Ora il progresso si salva solo se le pagine mostrate appartengono davvero al capitolo corrente (`loadedChapterId`). Verificato: dopo la correzione il capitolo si apre a pagina 1 e salva 0.

## 6. Verifica

In sandbox, con file veri nell'OPFS del browser (handle reali, importati dall'interfaccia):

- PDF generati a mano: 40 pagine con una doppia, e 400 pagine. Import dall'interfaccia: i due PDF validi importati, un file di testo chiamato `.pdf` e un PDF troncato respinti come "non leggibili".
- Lettore: singola/doppia/scroll, doppia pagina divisa in due metà da 1.400 px, navigazione, miniatura salvata, progresso salvato.
- Un CBZ di prova continua a funzionare (compresa la doppia pagina e la miniatura): i percorsi degli archivi non sono cambiati.
- **PDF più realistico**: 40 pagine che sono immagini JPEG da 1500×2200 (come un volume scansionato), 64 MB. Validazione 0,39 s, apertura 0,32 s, ~60 ms per pagina (desktop), heap JavaScript stabile a ~34 MB leggendone 30 di seguito.

## 7. Limiti noti, e cosa non è stato verificato

- **PDF con password**: rifiutati con il messaggio già esistente. Il percorso `PasswordException → 'encrypted'` segue la documentazione di pdf.js, ma **non è stato provato con un PDF cifrato vero** (non è stato possibile costruirne uno in sandbox).
- **Tutto il file in memoria**: pdf.js riceve il contenuto del file con `file.arrayBuffer()`. Per PDF da centinaia di MB su un tablet con poca RAM potrebbe non bastare; l'alternativa (lettura a intervalli con `PDFDataRangeTransport`) è possibile, ma non è stata fatta. Provati fino a 64 MB, sul desktop.
- **Font e testo**: non si caricano i font standard né le mappe dei caratteri CJK. I volumi scansionati (immagini) non ne hanno bisogno; un PDF di testo con font non incorporati può mostrare un carattere sostitutivo.
- **Il tablet**: tempi e memoria reali non misurati (le misure sopra sono di un desktop, con dati sintetici).
- Il PDF non ha selezione del testo né ricerca: l'app mostra immagini di pagina.

## 8. Cosa si è imparato

- **Lazy = fare il lavoro quando serve, e disfarlo quando non serve più**: carico a richiesta (`import()`), disegno a richiesta (`load()`), rilascio fuori dalla vista (`IntersectionObserver`).
- **Memorizzare la promessa**, non il risultato, evita lavoro doppio quando più richieste arrivano insieme.
- **Un'interfaccia comune** (`{ groups, dispose }`) permette di aggiungere un formato senza riscrivere il Lettore: gli archivi e i PDF si distinguono solo dentro `comicFile.js`.
- **Misurare su dati realistici**: le prime prove con pagine vettoriali erano troppo rosee; la prova con pagine-immagine da 64 MB ha dato i numeri sensati.
- **Leggere il vero messaggio d'errore invece di indovinare**: la validazione dei PDF validi rispondeva "non leggibile" perché il documento di pdf.js non ha `destroy()` (si chiude dal "task" di caricamento); un `catch` troppo largo nascondeva l'errore, e solo guardandolo si è trovato. Un test, poi, si era bloccato durante il disegno e dopo un ricaricamento pulito della pagina non si è più ripresentato: la causa precisa non è stata identificata (probabile stato dei moduli in sviluppo dopo una modifica a caldo), e lo segnalo invece di fingere di averla capita.
