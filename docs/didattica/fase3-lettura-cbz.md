# Fase 3 — Lettura di un singolo CBZ (proof of concept)

> Documentazione didattica, scritta per chi non ha mai visto React prima. In questa fase compaiono i primi concetti "core" di React (stato, eventi, rendering di liste) — spiegati da zero.

---

## 🎯 Obiettivo della fase

Validare l'intera catena **file → immagini → schermo** con il caso più semplice possibile: un solo file CBZ, scelto con il file picker classico del browser, le cui pagine vengono estratte e mostrate in sequenza. Niente ancora libreria, niente modalità di lettura multiple, niente persistenza — solo la prova che la catena tecnica funziona, prima di costruirci sopra le fasi successive.

Un file **CBZ** è, tecnicamente, un semplice archivio **ZIP** rinominato: dentro contiene le immagini delle pagine, una per file, in ordine. Per questo lo strumento scelto per "aprirlo" è `JSZip`, una libreria che sa leggere archivi ZIP in JavaScript, lato browser (non serve nessun server: tutto avviene nel dispositivo dell'utente, coerente con l'obiettivo "100% offline" del progetto).

---

## 🧩 Concetti di React introdotti in questa fase

Le fasi precedenti (1 e 2) non avevano bisogno di "far ricordare" nulla al componente: mostravano sempre lo stesso contenuto statico. Da questa fase, invece, il componente `Reader` deve **ricordarsi** quali pagine ha estratto, per poterle disegnare. Qui entra in gioco il primo hook di React: `useState`.

### Cos'è un "hook" e cos'è `useState`

Un **hook** è una funzione speciale di React (si riconoscono perché iniziano sempre con `use`) che permette a un componente-funzione di avere capacità che una normale funzione JavaScript non ha — nel caso di `useState`, la capacità di "ricordare" un valore tra un rendering e l'altro.

```jsx
const [pages, setPages] = useState([]);
```

Questa riga fa tre cose:

- Dichiara una variabile di stato chiamata `pages`, con valore iniziale un array vuoto `[]` (nessuna pagina, prima che l'utente scelga un file)
- Fornisce `setPages`, l'unico modo corretto per **cambiare** quel valore
- Ogni volta che si chiama `setPages(...)`, React **ri-esegue** la funzione `Reader()` da capo, con il nuovo valore di `pages` — questo è ciò che fa "aggiornare" l'interfaccia sullo schermo

Attenzione: non si scrive mai `pages = [...]` direttamente (non funzionerebbe, e comunque React non se ne accorgerebbe). Si passa sempre dal "setter" (`setPages`).

Nel file [`Reader.jsx`](../../src/pages/Reader.jsx) usiamo **due** stati distinti:

```jsx
const [pages, setPages] = useState([]);   // le immagini estratte, da mostrare
const [error, setError] = useState(null); // un eventuale messaggio di errore
```

Tenerli separati (invece di un unico stato "complesso") rende più semplice leggere e aggiornare ciascuno dei due indipendentemente.

### Gestire un evento: `onChange` sull'input file

```jsx
<input type="file" accept=".cbz" onChange={handleFileChange} />
```

In JSX, gli eventi si collegano passando una funzione (non stringhe come in HTML classico: niente `onchange="..."`). `accept=".cbz"` è solo un suggerimento per il selettore di file del sistema operativo (filtra cosa mostrare), non una vera validazione — per questo il codice comunque prova a leggere il file e gestisce l'eventuale errore se non è uno ZIP valido.

`handleFileChange` è una funzione **`async`**: legge il file, lo passa a `JSZip`, aspetta (`await`) che l'estrazione finisca, e solo alla fine chiama `setPages(...)` con le immagini pronte. Nel mezzo, l'interfaccia resta reattiva: l'utente può continuare a interagire con il resto della pagina mentre il file viene elaborato.

### Rendering di una lista: `.map()` e la prop `key`

```jsx
{pages.map((pageUrl, index) => (
  <img key={pageUrl} src={pageUrl} alt={`Pagina ${index + 1}`} width="100%" />
))}
```

Per trasformare un array di dati (`pages`) in un elenco di elementi JSX, si usa il normale `.map()` di JavaScript — niente di specifico di React qui. L'unica regola in più è la prop **`key`**: React la usa per riconoscere "quale elemento è quale" tra un rendering e l'altro (ad esempio per capire cosa è cambiato quando l'array si aggiorna), e deve essere un valore stabile e univoco per ogni elemento — qui usiamo direttamente l'URL dell'immagine, che è unico per ogni pagina.

---

## 🛠️ Come funziona l'estrazione (fuori da React)

Il cuore tecnico della fase non riguarda React, ma le API del browser per leggere file ed archivi:

1. **`JSZip.loadAsync(file)`** legge il file scelto dall'utente e lo interpreta come archivio ZIP, restituendo un oggetto con l'elenco di tutti i file contenuti (`zip.files`)
2. Filtriamo quell'elenco per tenere solo le **immagini** (estensione `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`), scartando eventuali file `ComicInfo.xml` o cartelle che a volte si trovano dentro i CBZ
3. **Ordiniamo** le pagine per nome file, ma con l'opzione `numeric: true` di `localeCompare` — senza questa accortezza, un ordinamento alfabetico "ingenuo" metterebbe `pagina10.jpg` prima di `pagina2.jpg` (perché "1" viene prima di "2" carattere per carattere); con `numeric: true` il confronto riconosce i numeri e ordina correttamente `pagina2` prima di `pagina10`
4. Per ogni pagina, **`entry.async('blob')`** estrae i byte dell'immagine in memoria come `Blob`
5. **`URL.createObjectURL(blob)`** crea un URL temporaneo (tipo `blob:http://localhost/...`) valido solo in questa scheda del browser, che un tag `<img>` può usare come `src` per mostrare l'immagine — senza dover salvare nulla su disco

Un dettaglio di "pulizia": ogni URL creato con `createObjectURL` occupa memoria finché non viene esplicitamente rilasciato con `URL.revokeObjectURL(...)`. Per questo, quando l'utente sceglie un **nuovo** file, il codice rilascia prima gli URL delle pagine precedenti:

```js
pages.forEach((page) => URL.revokeObjectURL(page));
```

---

## ✅ Come verificare che funzioni

Con un file CBZ reale (rinomina pure un file `.zip` contenente immagini in `.cbz` per fare una prova): aprendo la vista Lettore e scegliendo il file, le pagine devono comparire in sequenza verticale, nell'ordine corretto.

Verificato in questa fase (con un CBZ di prova costruito ad hoc, 3 pagine `page1/page2/page10` per testare l'ordinamento):

- Le pagine vengono estratte e mostrate nell'ordine numerico corretto (non alfabetico "ingenuo")
- Scegliendo un file non valido (non uno ZIP), compare il messaggio d'errore invece di un crash silenzioso, e non restano pagine "fantasma" della selezione precedente
- Nessuna richiesta di rete o errore in console

---

## 🔜 Prossimi passi

Questa fase è volutamente minimale: un solo file, una sola modalità di visualizzazione (sequenza verticale semplice), nessun salvataggio. La Fase 4 estenderà l'estrazione anche ai file **CBR**; le vere modalità di lettura (pagina singola, doppia pagina, scroll continuo) arriveranno con la Fase 5; il collegamento a una libreria persistente (IndexedDB) è rimandato alla Fase 7 in poi.
