# Fase 10 — Vista Libreria (Serie → Volumi → Capitoli)

> Documentazione didattica, scritta per chi non ha mai visto React prima. È la fase che "unisce i puntini": la struttura dati (Fase 7-9), gli handle ai file (Fase 8) e il Lettore (Fase 3-6) diventano un'unica esperienza — sfogliare la libreria e aprire un capitolo.

---

## 🎯 Obiettivo della fase

Fino a qui i capitoli categorizzati "sparivano" dalla lista *Da categorizzare* senza andare da nessuna parte visibile. Questa fase costruisce il **catalogo**: una vista a tre livelli (Serie → Volumi → Capitoli) da navigare toccando, con una **copertina** per ogni voce, e — punto centrale — il **collegamento al Lettore**: toccare un capitolo lo apre e lo si può leggere, usando l'handle al file salvato in Fase 8.

---

## 🧭 Navigazione a livelli con lo stato

Il catalogo (in [`src/components/Catalog.jsx`](../../src/components/Catalog.jsx)) è un unico componente che mostra tre "schermate" diverse a seconda di dove sei arrivato. Come in Fase 5 per le modalità di lettura, il "dove sono" è semplicemente un pezzo di stato:

```jsx
const [level, setLevel] = useState('series'); // 'series' | 'volumes' | 'chapters'
const [currentSeries, setCurrentSeries] = useState(null);
const [currentVolume, setCurrentVolume] = useState(null);
```

Toccare una serie carica i suoi volumi e scende di livello; toccare un volume carica i suoi capitoli. I dati si caricano **nel gestore del tocco**, non in un `useEffect`:

```jsx
async function openSeries(item) {
  setCurrentSeries(item);
  setVolumes(await getVolumesForSeries(item.id));
  setLevel('volumes');
}
```

Perché non un effetto? Perché il caricamento è la *conseguenza diretta di un'azione dell'utente* (un tocco), non di un cambiamento di stato da "osservare". Caricare qui è più semplice e diretto: un solo `useEffect` resta, quello iniziale che carica l'elenco delle serie all'apertura.

### Le "briciole di pane" (breadcrumb)

In cima c'è il percorso — *Serie / One Piece / Volume 1* — con le voci precedenti cliccabili per risalire. Anche questa è pura funzione dello stato: mostro la serie corrente solo se `currentSeries` esiste, il volume solo se `currentVolume` esiste, e i pulsanti "risali" azzerano lo stato del livello corrispondente.

---

## 🖼️ Le copertine: da Blob a immagine, con `useMemo`

Ogni voce del catalogo mostra una miniatura. Le miniature sono salvate nel database come **Blob** (dati binari dell'immagine). Per mostrarle in un `<img>` serve un URL: si crea con `URL.createObjectURL(blob)` — ma quell'URL occupa memoria finché non lo si **revoca**, esattamente come le pagine nel Lettore.

Il piccolo componente `Cover` gestisce questo ciclo di vita:

```jsx
function Cover({ blob, alt }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!url) return <div className="catalog-cover--placeholder">📖</div>;
  return <img className="catalog-cover" src={url} alt={alt} />;
}
```

Due strumenti nuovi qui:

- **`useMemo`**: calcola un valore e lo "ricorda" finché le sue dipendenze non cambiano. `URL.createObjectURL` viene chiamato **una sola volta per ciascun Blob**, non a ogni ridisegno del componente — senza `useMemo` creeremmo un nuovo URL (e una piccola perdita di memoria) a ogni render.
- **la funzione di pulizia dell'effetto** (`return () => …`): React la esegue quando il componente scompare o prima di ricalcolare — qui revoca l'URL, liberando la memoria. È lo stesso meccanismo `return () => { … }` già visto per annullare i caricamenti in corso, applicato a un'altra risorsa da "chiudere".

Se il Blob non c'è (copertina non ancora generata), si mostra un segnaposto 📖 invece di un'immagine rotta.

### Da dove arrivano le copertine: generate "alla lettura"

Una miniatura è la prima pagina del capitolo, ridimensionata. Ma generarla richiede di **leggere il file** — che a sua volta richiede il permesso di accesso. Non possiamo generarle tutte all'apertura della libreria (sarebbe lento e richiederebbe il permesso su ogni file).

La scelta: la miniatura viene generata **la prima volta che apri un capitolo nel Lettore** (il file è già stato letto e decompresso in quel momento — riusiamo la sua prima pagina, gratis) e salvata nel database. La stessa miniatura fa da copertina anche per il suo volume e la sua serie, se non ne hanno già una. Conseguenza pratica: una libreria appena creata mostra segnaposti, che diventano copertine vere man mano che leggi i capitoli. È un compromesso onesto che evita di leggere decine di file solo per fare le anteprine.

Il ridimensionamento avviene con un `<canvas>` (come il taglio delle doppie pagine in Fase 5), in [`src/comicFile.js`](../../src/comicFile.js) — un nuovo modulo in cui è stata **spostata** tutta la logica di lettura degli archivi, prima dentro il Lettore. Ora sia il Lettore sia la generazione miniatura la condividono, senza duplicarla.

---

## 🔗 Aprire un capitolo: il nodo del permesso

Toccare un capitolo deve aprirlo nel Lettore. Tecnicamente significa: dall'handle salvato → leggere il file → estrarne le pagine. Ma c'è un vincolo delicato, già anticipato in Fase 8: **il permesso di lettura su un handle va (ri)chiesto durante un "gesto utente"** (un tocco), e non si può chiedere "a freddo" mentre una pagina si sta caricando.

Questo determina *dove* mettere la richiesta di permesso. Metterla nel Lettore, dentro un effetto che parte al caricamento della pagina, **non funzionerebbe**: quando l'effetto parte, il tocco è già "finito" e il browser rifiuterebbe la richiesta. Quindi la richiesta va fatta **nel catalogo, nel gestore del tocco**, prima di navigare al Lettore:

```jsx
async function openChapter(chapter) {
  const granted = await verifyPermission(chapter.handle, 'read'); // durante il gesto: OK
  if (!granted) { setPermissionError('Permesso negato.'); return; }
  navigate(`/reader/${chapter.id}`);
}
```

Nota che `chapter.handle` è **già in memoria** (caricato insieme al capitolo): non c'è nessun `await` *prima* di `verifyPermission`, così la richiesta parte ancora "dentro" il gesto del tocco. Solo dopo che il permesso è concesso si naviga.

### Il Lettore che apre per id: `useParams`

Per far aprire al Lettore un capitolo specifico si sfrutta React Router. In [`App.jsx`](../../src/App.jsx) c'è una nuova rotta con un **parametro**:

```jsx
<Route path="/reader/:chapterId" element={<Reader />} />
```

I due punti in `:chapterId` dicono a React Router "questa parte dell'indirizzo è variabile". Nel Lettore la si legge con `useParams`:

```jsx
const { chapterId } = useParams();
```

Se `chapterId` c'è, un effetto carica quel capitolo dal database, **verifica** (non richiede più: il permesso è già stato concesso nel catalogo) che il permesso ci sia, legge il file e ne estrae le pagine. Se `chapterId` non c'è (rotta `/reader` semplice), il Lettore mostra il vecchio selettore file manuale — così entrambe le strade convivono.

### Gestire l'imprevisto

Un file può essere stato spostato o cancellato dal dispositivo dopo l'import (l'app tiene solo un *riferimento*, ricordi?). In quel caso leggerlo fallisce. Sia il catalogo sia il Lettore avvolgono l'apertura in un `try/catch` che mostra un messaggio chiaro ("il file potrebbe essere stato spostato o eliminato") invece di restare bloccati o rompersi. Questo caso — file sparito — sarà gestito in modo più completo in Fase 11.

---

## 🔁 Ricaricare il catalogo dopo una categorizzazione

Quando categorizzi un nuovo capitolo (Fase 9), il catalogo deve accorgersene e mostrarlo. Invece di intrecciare la logica di ricarica tra genitore e figlio, si usa un trucco elegante di React: la prop speciale **`key`**.

```jsx
<Catalog key={catalogVersion} />
// ...
onDone={() => { setCategorizing(null); refresh(); setCatalogVersion((v) => v + 1); }}
```

React usa `key` per capire se un elemento è "lo stesso" tra un render e l'altro. Cambiando `key`, React considera il Catalogo un componente **nuovo**: lo smonta e lo rimonta da capo, rieseguendo il suo caricamento iniziale. È un modo semplicissimo di dire "ricomincia da zero" senza aggiungere logica dentro il figlio.

---

## ✅ Come verificare che funzioni

La navigazione del catalogo è stata verificata inserendo dati di prova nel database (serie, volumi, capitoli, con alcune miniature):

- Livello serie → mostra le serie in ordine alfabetico; quelle con copertina mostrano l'immagine, le altre il segnaposto 📖.
- Toccare una serie → mostra i suoi volumi; toccare un volume → mostra i suoi capitoli; il percorso in cima si aggiorna a ogni livello.
- Le briciole di pane risalgono correttamente ai livelli precedenti.
- Toccare un capitolo con un file non più accessibile → messaggio d'errore chiaro, nessun blocco (verificato con un handle finto: il flusso permesso→apertura parte e degrada con grazia).
- La rotta `/reader/:chapterId` con un file non accessibile mostra l'errore invece di restare su "Caricamento…" (bug trovato e corretto durante la verifica).
- Il selettore file manuale su `/reader` continua a funzionare dopo lo spostamento della logica in `comicFile.js` (estrazione di un CBZ reale a 23 pagine, ok).

**Da verificare sul dispositivo/browser reale (non automatizzabile qui):** l'apertura effettiva di un capitolo con un handle vero — cioè il round-trip permesso concesso → navigazione → lettura del file → comparsa delle pagine → generazione della miniatura. Con handle "finti" (dati di prova) si può testare solo la logica di navigazione e la gestione degli errori, non il vero accesso ai file, che richiede il selettore nativo e un gesto utente reale.

---

## 🔜 Prossimi passi

Il ciclo "importa → categorizza → sfoglia → leggi" è ora completo. La **Fase 11** aggiunge la rimozione (di serie, volumi, capitoli), con conferma e la scelta se eliminare anche il file fisico, più la pulizia automatica dei riferimenti a file spariti. La **Fase 12** salverà i progressi di lettura, così riaprendo un capitolo si riparte dall'ultima pagina.
