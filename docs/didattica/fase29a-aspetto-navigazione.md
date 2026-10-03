# Fase 29a — Aspetto e navigazione

> Prima metà della Fase 29 (decisioni in [ADR-002](../decisions/ADR-002-barra-di-navigazione-e-marchio.md)). L'app "troppo scolastica" diventa un po' meno: un marchio al posto di tre voci di testo, una navigazione a icone, e un solo set di icone al posto delle emoji. La seconda metà (importazione, Lettore a vuoto, Libreria riordinata, pagina iniziale) è la 29b.

---

## 1. Un set di icone al posto delle emoji

Prima l'interfaccia mescolava emoji (🗑 🖼 🏷 📄 ⚠ ★) e qualche icona SVG fatta a mano nel Lettore. Le emoji hanno tre difetti pratici: **cambiano aspetto da un sistema all'altro** (sul tablet Android sono quelle di Google, su Windows quelle di Microsoft), **non seguono il colore del testo** (una stella dorata deve poterla colorare il CSS, non il font) e **non si adattano allo stile** dell'app.

`Icon.jsx` raccoglie tutte le icone in un'unica mappa di forme SVG, con lo stesso tratto (1,7 px, estremi arrotondati). Si usano così:

```jsx
<Icon name="star" filled={favorite} />
```

Il trucco è `stroke: currentColor` (in `index.css`): l'icona prende il colore del testo del contenitore. Quindi la stella di un preferito diventa dorata semplicemente perché il bottone che la contiene ha `color: #e0b23f` quando è premuto; nessuno stile sull'icona stessa. `filled` aggiunge solo `fill: currentColor`.

Le emoji erano anche nei **testi tradotti** (`"✓ Letto"`, `"➕ Nuova serie…"`, `"🔖 Segnalibro"`). Nelle tendine `<option>` non si può mettere un SVG, quindi lì il simbolo è diventato un `+` semplice; altrove l'icona è nel JSX e la traduzione contiene solo la parola ("Letto"). Un bonus: i lettori di schermo non devono più leggere "segnalibro segnalibro" (nome dell'emoji + testo).

## 2. Il marchio

`Brand.jsx` disegna il nome "Manga Reader" in tre varianti, tutte con font e colori già dell'app (Shippori Mincho, accento azzurro, 読):

- **Sigillo** (predefinita): 読 in un quadrato con bordo azzurro, ruotato di 4 gradi come un timbro
- **Dorso**: un libro "di taglio" con 読, nome su due righe
- **Blueline**: il nome con una linea azzurra sotto, come il filo delle tavole

Il nome non passa da i18n: "Manga Reader" è il nome del prodotto, uguale in ogni lingua.

## 3. Le preferenze di aspetto

Marchio e menu si scelgono in **Impostazioni → Aspetto**, e restano sul dispositivo. Tre pezzi:

- `uiPreferences.js`: le opzioni valide, i predefiniti, e le funzioni che leggono e scrivono `localStorage`. Un valore sconosciuto (storage rovinato, opzione rimossa in futuro) ricade sul predefinito invece di rompere la barra.
- `UiPreferencesContext.jsx`: un Context che rende le preferenze disponibili sia alla barra (che le usa) sia a Impostazioni (che le cambia), senza passarle di mano in mano. Stessa idea dell'`AppChromeContext` della Fase 21.
- Le costanti stanno in un file **a parte** rispetto al Context perché la regola `react-refresh/only-export-components` di ESLint non vuole costanti e funzioni esportate accanto a un componente: va bene solo un componente (più, con un commento mirato, l'hook).

In Impostazioni ogni marchio è mostrato con la sua anteprima vera (`<Brand variant={…}/>` dentro il bottone), non solo con il nome: la scelta è visiva e va fatta guardando.

## 4. La navigazione in tre forme

`AppNav.jsx` mostra le stesse tre destinazioni (Libreria, Lettore, Impostazioni) in tre modi:

| Menu | Cosa fa |
|---|---|
| **Icone in barra** (predefinito) | tre icone sempre visibili, quella della sezione attiva piena in azzurro; un tocco per cambiare sezione |
| **A tendina** | un burger apre un pannello sotto la barra |
| **Laterale** | un burger apre un pannello a tutta altezza dal bordo destro, con la X per chiuderlo |

Dettagli che contano:
- `NavLink` (di React Router) sa da solo quale sezione è attiva e dà la classe `active`; la barra non tiene traccia di nulla.
- Nel pannello laterale il pannello copre il burger, quindi serve una X dentro l'intestazione (mancava in una prima versione).
- Il menu si chiude con Escape, toccando fuori (lo "scrim", un velo che copre la pagina) o toccando una voce. Per chiuderlo toccando una voce non serve un effetto che osservi la rotta: basta `onClick={closeMenu}` sulla voce.
- La barra continua a sparire al tocco durante la lettura (`AppChromeContext`): la barra intera, quindi anche il menu aperto.

Una voce di colore: il kanji accanto a ogni voce del menu (蔵書, 頁, 設定) è lo stesso eyebrow già usato come titolo delle pagine.

## 5. Un dettaglio rimasto indietro

`.library-notice` usava ancora uno sfondo ambra (`rgba(245, 166, 35, …)`), residuo della palette precedente alla Yomihon, quando l'accento era ambra. Ora segue l'azzurro come il resto: un esempio di come un restyling lasci sempre qualche valore "scritto a mano" che i design token non coprono.

## Cosa NON è cambiato

- Il comportamento dell'app: nessuna logica di dati, import, lettura o backup toccata.
- La palette e i font Yomihon.
- La struttura delle pagine (la riorganizzazione di Libreria e Lettore è la 29b).

## Verifica

In sandbox (con dati di prova in IndexedDB):
- barra con marchio Sigillo e icone; sezione attiva evidenziata
- Impostazioni → Aspetto: i tre marchi con anteprima, le tre forme di menu; scelta salvata in `localStorage` e ripristinata dopo un ricaricamento
- menu a tendina e laterale: aprono, mostrano la voce attiva, si chiudono con Escape, X, scrim o toccando una voce, e navigano
- **telefono (375 px) e telefono stretto (320 px):** marchio e icone non si sovrappongono e non c'è scorrimento orizzontale; a 320 px il marchio Sigillo accorcia il nome con i puntini, Dorso e Blueline ci stanno intere
- il Catalogo, la coda "Da categorizzare", i Preferiti e le sezioni di lettura con le icone nuove; nessuna emoji rimasta nel codice né nei testi mostrati
- `npm run lint` pulito

**Da verificare su dispositivo reale** (Federico, fuori sandbox): resa del marchio e delle icone su tablet in orizzontale e in verticale e su un telefono vero, e quanto sono comode da toccare le tre icone in barra.
