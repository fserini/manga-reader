# Fase 5 — Modalità di lettura

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase introduce meno concetti nuovi di React in senso stretto, e più **pattern di composizione**: come far convivere più "modalità" di uno stesso componente in modo pulito. Si dà per letta la Fase 3 (per `useState`) e la Fase 4.

---

## 🎯 Obiettivo della fase

Il Lettore, fino ad ora, mostrava le pagine in un unico modo (tutte impilate). Questa fase introduce **tre modalità di visualizzazione** scelte dall'utente:

- **Pagina singola**: una pagina alla volta, con pulsanti Precedente/Successiva
- **Doppia pagina (spread)**: due pagine affiancate alla volta
- **Scroll continuo**: tutte le pagine impilate, si scorre liberamente (la modalità che avevamo già, ora una opzione tra le altre)

Insieme a questo, è stata la prima occasione per dare all'app un aspetto meno "template Vite di default" e più coerente con l'identità scelta per la PWA (Fase 2).

---

## 🧩 Un solo componente, più "viste": il pattern della modalità

Il punto centrale della fase è gestire tre modi di mostrare gli stessi dati (`pages`) con **un solo componente**, invece di crearne tre diversi. La ricetta:

```jsx
const [mode, setMode] = useState('single');
```

Un nuovo stato, `mode`, che può valere `'single'`, `'spread'` o `'scroll'`. In base al suo valore, nel JSX si decide **cosa renderizzare**, usando l'operatore `&&` come "if" abbreviato (già visto in fasi precedenti per mostrare/nascondere l'errore):

```jsx
{pages.length > 0 && mode === 'scroll' && (
  <div className="reader-pages reader-pages--scroll">
    {pages.map((pageUrl, index) => (
      <img key={pageUrl} src={pageUrl} alt={`Pagina ${index + 1}`} />
    ))}
  </div>
)}

{pages.length > 0 && mode === 'single' && (
  <div className="reader-pages reader-pages--single">
    <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} />
  </div>
)}
```

`a && b && c` valuta da sinistra a destra: se `a` è falso, si ferma subito (React non renderizza nulla); se sono tutti veri, viene renderizzato l'ultimo pezzo (il JSX). Con tre condizioni così, ad ogni rendering **solo uno dei tre blocchi** viene effettivamente mostrato: quello il cui `mode === '...'` risulta vero.

### Il selettore di modalità: una lista di bottoni da un array

Come già fatto per i link della barra di navigazione (Fase 1), la lista di pulsanti "Pagina singola / Doppia pagina / Scroll continuo" nasce da un array di configurazione:

```jsx
const READING_MODES = [
  { value: 'single', label: 'Pagina singola' },
  { value: 'spread', label: 'Doppia pagina' },
  { value: 'scroll', label: 'Scroll continuo' },
];

// ...

{READING_MODES.map(({ value, label }) => (
  <button
    key={value}
    type="button"
    className={mode === value ? 'active' : ''}
    onClick={() => setMode(value)}
  >
    {label}
  </button>
))}
```

Vantaggio pratico: per aggiungere una futura quarta modalità basterebbe aggiungere una riga all'array, senza toccare il JSX che la disegna — lo stesso principio già visto per `NAV_LINKS` in `App.jsx`.

---

## 🔢 La logica di navigazione: `currentIndex` e "clamping"

Per le modalità "pagina singola" e "doppia pagina" serve sapere **quale** pagina (o coppia) è quella visualizzata al momento: un secondo stato, `currentIndex`, che indica l'indice della prima pagina mostrata (0 per la prima pagina, 1 per la seconda, ecc.).

```js
const step = mode === 'spread' ? 2 : 1;

function clampIndex(index) {
  return Math.max(0, Math.min(index, pages.length - 1));
}

function goToNext() {
  setCurrentIndex((index) => clampIndex(index + step));
}
```

Due dettagli tecnici che vale la pena isolare:

- **`step`**: quante pagine si avanza per volta. 1 in modalità singola, 2 in modalità doppia — così lo stesso codice di navigazione (`goToPrevious`/`goToNext`) funziona per entrambe le modalità, cambia solo di quanto "saltano"
- **`clampIndex`** ("bloccare dentro un intervallo"): `Math.max(0, Math.min(index, pages.length - 1))` garantisce che l'indice non scenda mai sotto 0 né superi l'ultima pagina disponibile, qualsiasi cosa succeda (es. cliccando "Successiva" ripetutamente sull'ultima pagina, l'indice resta fermo lì invece di "uscire" dall'array)

Questo secondo dettaglio risolve automaticamente anche il caso di un numero **dispari** di pagine in modalità doppia: se restano 5 pagine e si è arrivati all'indice 4 (ultima pagina), lo spread mostra solo `pages[4]` perché `pages[5]` semplicemente non esiste — nel JSX questo si gestisce con un altro `&&`:

```jsx
<img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} />
{pages[currentIndex + 1] && (
  <img src={pages[currentIndex + 1]} alt={`Pagina ${currentIndex + 2}`} />
)}
```

Se `pages[currentIndex + 1]` è `undefined` (non esiste), `undefined && (...)` vale `undefined`: React non renderizza nulla, niente immagine "rotta".

`setCurrentIndex((index) => ...)` usa la forma "funzionale" del setter (una funzione invece di un valore diretto): riceve sempre il valore di stato più aggiornato, utile qui perché il nuovo indice dipende dal precedente.

---

## 📖 Split automatico delle doppie pagine e direzione di lettura

Testando la fase con un fumetto vero (non più solo pagine finte di prova) è emerso un caso che l'analisi funzionale originale non aveva previsto: alcune edizioni esportano **ogni tavola già come doppia pagina** — un solo file immagine, più largo che alto, contenente fisicamente due pagine affiancate. In modalità "pagina singola" questo produceva un risultato sbagliato: veniva mostrato il file così com'è (cioè due pagine insieme), invece di una pagina alla volta.

### Rilevare una doppia pagina: il rapporto larghezza/altezza

Una pagina di un fumetto è quasi sempre verticale (più alta che larga). Se un file estratto risulta invece più largo che alto, è un forte indizio che si tratti di due pagine unite:

```js
const SPREAD_ASPECT_RATIO_THRESHOLD = 1;

const bitmap = await createImageBitmap(blob);
if (bitmap.width / bitmap.height > SPREAD_ASPECT_RATIO_THRESHOLD) {
  // probabile doppia pagina, va tagliata
}
```

`createImageBitmap()` è un'API del browser che decodifica un'immagine (qui, un `Blob` già estratto dall'archivio) e ne restituisce le dimensioni reali in pixel, senza doverla prima disegnare da qualche parte sullo schermo.

### Tagliare l'immagine in due: il `<canvas>`

Un `<canvas>` è un'area di disegno programmabile: si può "dipingere" sopra porzioni di un'immagine e poi esportare il risultato come nuovo file. Per tagliare una doppia pagina in due metà:

```js
const halfWidth = Math.round(width / 2);

const left = document.createElement('canvas');
left.width = halfWidth;
left.height = height;
left.getContext('2d').drawImage(bitmap, 0, 0, halfWidth, height, 0, 0, halfWidth, height);
```

`drawImage(sorgente, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)` prende un rettangolo dalla sorgente (qui: dal pixel 0 fino a metà larghezza) e lo disegna nel canvas di destinazione. Si ripete lo stesso per la metà destra (partendo da `halfWidth` invece che da 0), poi `canvas.toBlob(callback)` esporta il contenuto disegnato come un nuovo `Blob` — utilizzabile esattamente come le pagine estratte normalmente dall'archivio.

Questa logica vive in `splitSpreadIfNeeded()`, una funzione che **non sa nulla** di CBZ o CBR: lavora solo su un `Blob` già estratto. Per questo la stessa identica funzione si applica automaticamente a entrambi i formati, senza duplicare nulla.

### `pageGroups`: perché non basta un semplice elenco di pagine

Un dettaglio implementativo importante: le pagine tagliate non finiscono direttamente in un array piatto `pages`, ma in `pageGroups` — un array di **gruppi**, dove ogni gruppo è un array con una pagina sola (caso normale) o due (doppia pagina tagliata), sempre nello stesso ordine fisico `[sinistra, destra]`:

```js
setPageGroups(splitImages.map((images) => images.map((image) => URL.createObjectURL(image))));
```

Il motivo per cui non si "appiattisce" subito tutto è la **direzione di lettura** (occidentale sinistra→destra, o giapponese destra→sinistra, scelta dall'utente con un pulsante dedicato): a seconda della direzione, per una pagina tagliata è la metà destra o quella sinistra ad essere "letta per prima". Tenendo `pageGroups` separato dall'ordine di lettura, il calcolo dell'elenco effettivo da mostrare diventa una semplice trasformazione, ricalcolata ad ogni rendering:

```js
const pages = pageGroups.flatMap((group) =>
  readingDirection === 'rtl' ? [...group].reverse() : group
);
```

`flatMap` funziona come `.map()` ma "appiattisce" il risultato di un livello: se ogni gruppo produce un array di 1 o 2 elementi, il risultato finale è un unico array piatto — esattamente il formato che il resto del componente (navigazione, rendering) si aspettava già. In lettura giapponese (`rtl`), ogni gruppo viene invertito prima di essere unito: la metà destra (letta per prima) diventa la prima delle due nell'elenco finale.

Lo stesso ragionamento vale per l'**affiancamento visivo** in modalità doppia pagina: la pagina "letta per prima" va mostrata a destra in giapponese (esattamente come si aprirebbe un tankobon fisico), a sinistra in occidentale:

```jsx
{readingDirection === 'rtl' ? (
  <>
    {secondPageOfSpread && <img src={secondPageOfSpread} alt={...} />}
    <img src={pages[currentIndex]} alt={...} />
  </>
) : (
  <>
    <img src={pages[currentIndex]} alt={...} />
    {secondPageOfSpread && <img src={secondPageOfSpread} alt={...} />}
  </>
)}
```

Cambiare direzione di lettura a metà capitolo non richiede quindi ri-tagliare nessuna immagine (operazione costosa, coinvolge `canvas`): è solo un ricalcolo dell'ordine, praticamente istantaneo.

### Un limite noto, accettato consapevolmente

Il rilevamento "più larga che alta ⇒ doppia pagina" non è infallibile: alcuni fumetti contengono **splash page** — tavole disegnate intenzionalmente a piena doppia pagina, come scelta artistica (One Piece ne è un esempio famoso). Visivamente, una splash page intenzionale e due pagine unite per errore sono indistinguibili: non esiste un segnale affidabile per riconoscerle a priori.

Per questa fase si accetta il compromesso: lo split automatico resta sempre attivo (risolve il caso più comune, cioè edizioni che esportano ogni tavola come doppia pagina), sapendo che occasionalmente una splash page intenzionale verrà tagliata a metà. Un'opzione per escludere manualmente singole pagine dal taglio avrebbe senso solo una volta disponibile un posto dove salvare quella scelta per capitolo — cioè da quando arriverà IndexedDB (Fase 7+): costruirla ora, senza persistenza, significherebbe doverla rifare ad ogni ricaricamento della pagina.

---

## 🎨 Il restyling: dallo scheletro del template a un'identità propria

Le Fasi 1 e 2 avevano lasciato in eredità parecchio codice del template iniziale di Vite (il contatore di esempio, i loghi React/Vite, le card "Documentazione"/"Community"): componenti mai più referenziati da `App.jsx` dopo la Fase 1, ma i relativi file CSS e immagini erano rimasti nel progetto. In questa fase sono stati rimossi (`src/App.css` riscritto da zero, asset inutilizzati come `react.svg`/`vite.svg`/`hero.png`/`icons.svg` eliminati).

Un principio generale utile: **codice non più raggiungibile da nessun componente va eliminato**, non lasciato "per sicurezza" — rallenta solo la lettura futura del progetto.

### Le CSS custom properties (variabili CSS)

La nuova palette è definita una sola volta in `src/index.css`, tramite **custom properties** (variabili CSS, sintassi `--nome-variabile`):

```css
:root {
  --bg: #ffffff;
  --text: #1f2023;
  --accent: #f5a623;
  /* ... */
}
```

e poi riutilizzata ovunque nel progetto con `var(--nome-variabile)`, ad esempio `background: var(--accent)`. Il vantaggio: cambiare un colore in un solo punto lo aggiorna automaticamente in tutta l'app, invece di cercare e sostituire lo stesso valore esadecimale in decine di file.

Il colore d'accento (`#f5a623`, arancione) non è casuale: è lo stesso usato per l'icona della PWA generata in Fase 2 — un piccolo accorgimento per dare coerenza visiva tra l'icona installata sulla home e l'interfaccia dell'app.

### Il tema chiaro/scuro "gratuito"

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121212;
    /* ... */
  }
}
```

Questa media query ridefinisce le stesse variabili quando il sistema operativo dell'utente è impostato su tema scuro. Nessun codice JavaScript coinvolto: il browser applica automaticamente il set di colori giusto. Non è ancora il toggle manuale previsto dalla Fase 17 (che permetterà di scegliere il tema indipendentemente dalle impostazioni di sistema) — per ora l'app semplicemente "segue" il sistema, cosa che il template Vite di partenza faceva già, qui solo con una palette pensata apposta invece di quella di default.

---

## 🐞 Due bug reali, trovati solo testando con fumetti veri

Le pagine finte usate nei primi test (immagini 1×1 pixel) hanno un limite: nascondono i problemi di **dimensionamento**, perché un'immagine minuscola non rivela se il CSS che dovrebbe farla "riempire lo schermo" funziona davvero. Prima di chiudere la fase sono stati testati due file reali (un CBZ e un CBR), ed sono emersi due bug concreti — utili da ripercorrere perché sono errori CSS piuttosto comuni.

### Bug 1 — la catena di altezza interrotta

Le pagine in modalità singola/doppia comparivano piccolissime, in un angolo, circondate da spazio nero. Causa: il CSS usava solo `max-height: 100%` (limita, ma non ingrandisce mai un'immagine più piccola del riquadro) invece di `height: 100%` (riempie sempre). Ma anche correggendo quello, mancava un pezzo: `max-height`/`height: 100%` funzionano solo se **ogni** elemento genitore, fino alla radice della pagina, ha un'altezza definita — altrimenti la percentuale "non sa rispetto a cosa calcolarsi". Nella riscrittura del CSS di questa fase, la regola su `#root` (il div reale in cui React monta l'app, dentro `index.html`) era stata rimossa per errore, interrompendo la catena:

```css
html,
body,
#root {
  height: 100%;
}
```

Regola pratica da ricordare: se un `height: 100%` (o `flex: 1`) non sembra avere effetto, il primo sospetto è quasi sempre un antenato con altezza non definita più in alto nell'albero.

### Bug 2 — `justify-content: center` che "mangia" le prime pagine

In modalità scroll continuo, le prime pagine di un capitolo risultavano irraggiungibili scorrendo verso l'alto. Causa: `.reader-pages` (il contenitore condiviso da tutte e tre le modalità) ha `justify-content: center`, pensato per centrare l'unica immagine di pagina singola/doppia. In modalità scroll, però, il contenuto (decine di pagine impilate) è molto più alto del contenitore: **centrare verticalmente** un contenuto più alto del box lo fa sporgere ugualmente sopra e sotto — e la parte che sporge *sopra* diventa irraggiungibile, perché lo scroll non può mai andare "oltre l'inizio" (`scrollTop` non scende sotto 0).

Soluzione: per la sola variante scroll, sovrascrivere `justify-content: flex-start` (allinea all'inizio, non al centro):

```css
.reader-pages--scroll {
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
}
```

Il principio generale: **`justify-content: center` e contenuto che può crescere oltre le dimensioni del contenitore non vanno mai d'accordo** — va bene solo quando si è sicuri che il contenuto resti sempre più piccolo del box.

Entrambi i bug erano invisibili nei test con pagine finte 1×1: un'immagine di un pixel non "sporge" mai da nessuna parte. È il motivo per cui, da questa fase in poi, conviene sempre includere almeno un test con un file reale prima di considerare una funzionalità visiva conclusa.

---

## ✅ Come verificare che funzioni

Verificato in questa fase, sia con pagine di prova sia con un CBZ e un CBR reali (quest'ultimo da un'edizione le cui tavole sono quasi tutte esportate come doppie pagine, utile proprio per testare lo split):

- **Pagina singola**: naviga correttamente pagina per pagina, contatore "N / totale" corretto, pulsante "Precedente" disabilitato sulla prima pagina, pagine dimensionate per riempire lo schermo mantenendo le proporzioni
- **Doppia pagina**: mostra coppie corrette, gestisce correttamente l'ultima pagina "orfana" quando il totale è dispari, affiancamento speculare corretto in base alla direzione di lettura
- **Scroll continuo**: tutte le pagine impilate verticalmente e raggiungibili dall'inizio (bug 2 sopra, risolto)
- **Split automatico**: su un capitolo reale, 27 pagine su 28 riconosciute come doppie pagine e tagliate correttamente (verificato misurando le dimensioni reali delle metà ottenute); direzione di lettura giapponese di default, toggle verso occidentale verificato in entrambi i sensi
- Barra di navigazione: il link della pagina attiva è correttamente evidenziato (e solo quello — prima la voce "Libreria" restava evidenziata su ogni pagina, un piccolo difetto preesistente corretto aggiungendo la prop `end` a quel `NavLink`)
- Tema chiaro e scuro entrambi verificati (colore di sfondo corretto in entrambi i casi)

---

## 🔜 Prossimi passi

I controlli restano volutamente essenziali (pulsanti Precedente/Successiva, pulsante per la direzione di lettura): la Fase 6 introdurrà i controlli di navigazione più naturali per un lettore da tablet — tap sui bordi per cambiare pagina (verso dipendente dalla direzione di lettura), doppio tap per passare da pagina singola a doppia pagina, pinch-to-zoom, tap centrale per nascondere l'interfaccia, rotazione libera dello schermo.
