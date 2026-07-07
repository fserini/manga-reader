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

## ✅ Come verificare che funzioni

Verificato in questa fase, con un CBZ di prova a 5 pagine:

- **Pagina singola**: naviga correttamente pagina per pagina, contatore "N / totale" corretto, pulsante "Precedente" disabilitato sulla prima pagina
- **Doppia pagina**: mostra coppie corrette (es. "2-3 / 5"), gestisce correttamente l'ultima pagina "orfana" quando il totale è dispari (spread finale con una sola immagine, "5 / 5")
- **Scroll continuo**: tutte le pagine impilate verticalmente senza sovrapposizioni (verificato misurando le coordinate reali delle immagini nel browser) — il problema di impaginazione lasciato in sospeso alla Fase 4 risulta risolto in questa nuova versione del layout
- Barra di navigazione: il link della pagina attiva è correttamente evidenziato (e solo quello — prima la voce "Libreria" restava evidenziata su ogni pagina, un piccolo difetto preesistente corretto aggiungendo la prop `end` a quel `NavLink`)
- Tema chiaro e scuro entrambi verificati (colore di sfondo corretto in entrambi i casi)

---

## 🔜 Prossimi passi

I controlli restano volutamente essenziali (pulsanti Precedente/Successiva): la Fase 6 introdurrà i controlli di navigazione più naturali per un lettore da tablet — tap sui bordi per cambiare pagina, doppio tap/pinch per lo zoom, tap centrale per nascondere l'interfaccia, rotazione libera dello schermo.
