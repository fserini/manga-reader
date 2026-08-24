# Fase 6 — Controlli di navigazione in lettura

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase introduce la gestione degli eventi touch/mouse più a basso livello vista finora: distinguere un tap singolo da un doppio tap, riconoscere "in che zona dello schermo" è avvenuto un tocco, e tracciare un gesto a due dita (pinch).

---

## 🎯 Obiettivo della fase

Sostituire/affiancare i pulsanti "Precedente"/"Successiva" con interazioni più naturali per un lettore da tablet:

- **Tap su un bordo dello schermo** → pagina precedente/successiva (il verso dipende dalla direzione di lettura scelta in Fase 5)
- **Doppio tap** → passa da pagina singola a doppia pagina (e viceversa)
- **Tap al centro** → mostra/nasconde la barra degli strumenti e la navigazione (lettura immersiva)
- **Pinch-to-zoom** → ingrandisce/rimpicciolisce la pagina con due dita
- **Rotazione libera** → nessun codice necessario: il manifest PWA della Fase 2 non impone un `orientation` fisso, quindi il browser permette già liberamente portrait e landscape

---

## 🧩 Distinguere un tap da un doppio tap

Il browser non ha un evento nativo "doppio tap" per il touch generico (esiste `dblclick` per il mouse, ma non è pensato per il touch ed è meno affidabile su schermi diversi). Per riconoscerlo si usa una tecnica classica: **si aspetta un breve intervallo** dopo il primo tap, per vedere se ne arriva un secondo.

```js
const DOUBLE_TAP_DELAY_MS = 300;
const tapTimeoutRef = useRef(null);

function handlePagesClick(event) {
  if (tapTimeoutRef.current) {
    // è arrivato un secondo tap entro la soglia: è un doppio tap
    clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = null;
    handleDoubleTap();
    return;
  }

  // primo tap: si aspetta, per vedere se ne arriva un secondo
  tapTimeoutRef.current = setTimeout(() => {
    tapTimeoutRef.current = null;
    handleSingleTap(/* ... */);
  }, DOUBLE_TAP_DELAY_MS);
}
```

Al primo click, non si fa nulla subito: si avvia un timer (`setTimeout`) e ci si "segna" (in `tapTimeoutRef.current`) che si sta aspettando. Se il secondo click arriva prima che il timer scada, lo si intercetta (il timer è ancora lì) e si annulla (`clearTimeout`) prima che scatti l'azione da tap singolo, eseguendo invece quella da doppio tap. Se il secondo click **non** arriva, il timer scade naturalmente e scatta l'azione da tap singolo.

### Perché un `useRef` e non uno `useState`?

`tapTimeoutRef` è il primo `useRef` che compare nel progetto. È un hook "cugino" di `useState`, ma con una differenza fondamentale: **cambiare un `ref` non fa ri-renderizzare il componente**. Per un contatore di pagine ha senso che React "si accorga" del cambiamento (deve ridisegnare lo schermo). Per un timer interno di servizio, invece, non interessa a nessuno tranne alla funzione stessa che lo gestisce — usare `useState` qui provocherebbe ri-render inutili ad ogni tap. La regola pratica: se un valore serve solo "dietro le quinte" per la logica di un gestore di eventi, e non deve mai apparire sullo schermo, `useRef` è la scelta giusta.

## 📍 Riconoscere la zona del tap

Per sapere se il tap è avvenuto a sinistra, al centro o a destra, si confronta la posizione del click con i bordi dell'elemento cliccato:

```js
const TAP_ZONE_RATIO = 0.3; // 30% sinistra, 30% destra, 40% centro

const rect = event.currentTarget.getBoundingClientRect();
const relativeX = (event.clientX - rect.left) / rect.width;
const zone = relativeX < TAP_ZONE_RATIO ? 'left' : relativeX > 1 - TAP_ZONE_RATIO ? 'right' : 'center';
```

`event.clientX` è la posizione orizzontale del click rispetto a tutta la finestra del browser; sottraendo `rect.left` (dove inizia l'elemento) si ottiene la posizione **relativa** all'elemento stesso, e dividendo per la sua larghezza si ottiene un valore da 0 (bordo sinistro) a 1 (bordo destro) — indipendente dalla dimensione reale dello schermo, che sia un telefono o un tablet grande.

## ↔️ Il verso del tap dipende dalla direzione di lettura

```js
const isNextZone = readingDirection === 'rtl' ? zone === 'left' : zone === 'right';
```

In lettura giapponese (`rtl`), si "sfoglia" da destra verso sinistra: il tap a **sinistra** porta avanti. In lettura occidentale è il contrario. Lo stato `readingDirection`, introdotto in Fase 5 per decidere l'ordine delle doppie pagine tagliate, viene qui riutilizzato per un secondo scopo — è il vantaggio di aver tenuto quello stato a livello di componente invece che "nascosto" dentro la logica di taglio delle pagine.

---

## 🤏 Pinch-to-zoom: gestire due dita contemporaneamente

Gli eventi touch (`onTouchStart`, `onTouchMove`, `onTouchEnd`) espongono un elenco `touches` con **tutti** i punti di contatto attivi sullo schermo in quel momento — un dito singolo produce un array con un elemento, due dita un array con due elementi.

```js
function getTouchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function handleTouchStart(event) {
  if (event.touches.length === 2) {
    pinchStateRef.current = {
      initialDistance: getTouchDistance(event.touches),
      initialScale: zoomScale,
    };
  }
}
```

`Math.hypot(dx, dy)` calcola la distanza tra due punti (il teorema di Pitagora, `√(dx² + dy²)`, scritto come funzione pronta all'uso). Quando le due dita toccano lo schermo, si memorizza la distanza di partenza e lo zoom attuale.

```js
function handleTouchMove(event) {
  if (event.touches.length === 2 && pinchStateRef.current) {
    event.preventDefault();
    const distance = getTouchDistance(event.touches);
    const ratio = distance / pinchStateRef.current.initialDistance;
    setZoomScale(clamp(pinchStateRef.current.initialScale * ratio, MIN_ZOOM, MAX_ZOOM));
  }
}
```

Ad ogni movimento, si ricalcola la distanza attuale e si confronta con quella iniziale: se le dita si sono allontanate del doppio, `ratio` vale 2 e lo zoom raddoppia; se si sono avvicinate a metà, `ratio` vale 0.5 e lo zoom si dimezza. `clamp(valore, min, max)` (una piccola funzione di supporto già vista concettualmente per gli indici di pagina in Fase 5) impedisce di superare i limiti scelti (da 1× a 3×).

Lo zoom viene applicato con una trasformazione CSS:

```jsx
<img src={...} style={zoomScale !== 1 ? { transform: `scale(${zoomScale})` } : undefined} />
```

`transform: scale()` è una proprietà CSS che ingrandisce/rimpicciolisce un elemento **senza** che il browser debba ricalcolare tutto il resto del layout della pagina (a differenza di cambiare `width`/`height`), quindi resta fluido anche durante un gesto continuo come il pinch.

### `event.preventDefault()` e `touch-action: none`

Per default, un browser mobile interpreta il pinch a due dita come "zoom dell'intera pagina web" (la lente d'ingrandimento del sistema). Per evitare che il gesto "scappi" al browser invece di essere gestito dal nostro codice, servono **due** accorgimenti insieme:

- `event.preventDefault()` nel gestore di `touchmove`, che dice "gestisco io questo evento, non fare l'azione di default"
- `touch-action: none` in CSS sull'area lettore, che dice al browser in anticipo "non intercettare tu i gesti touch su questo elemento" — senza questa regola, alcuni browser potrebbero comunque agire prima che il JavaScript abbia la possibilità di chiamare `preventDefault()`

### Un limite di questo test: il pinch non è verificabile da un ambiente automatizzato

A differenza di quasi tutto il resto del progetto, il gesto pinch **non è stato testato su un vero schermo touch** in questa fase: gli strumenti di sviluppo automatizzati possono simulare click del mouse (e sono stati usati per verificare tap singolo, doppio tap e le zone), ma non un vero gesto a due dita su un dispositivo touch reale — serve un tablet o telefono vero, oppure gli strumenti di emulazione touch del browser stesso. La logica di calcolo dello zoom è stata comunque verificata "a tavolino" simulando via codice gli eventi touch (`TouchEvent`/`Touch`), confermando che i calcoli di distanza e scala sono corretti — ma il comportamento su un vero dispositivo (fluidità, eventuali conflitti con lo zoom nativo del browser) resta da verificare di persona.

---

## 🙈 Nascondere l'interfaccia: rendering condizionale, non CSS

```jsx
{interfaceVisible && (
  <div className="reader-toolbar">
    {/* ... */}
  </div>
)}
```

Per nascondere la barra strumenti si è scelto di **non renderizzarla affatto** (React la rimuove dal DOM) invece di nasconderla via CSS (es. `display: none`). Per un caso semplice come questo il risultato visivo è identico, ma rimuovere dal DOM ha un vantaggio pratico: elementi non presenti non possono ricevere il focus della tastiera né essere letti per errore da uno screen reader mentre sono "nascosti".

---

## ⚠️ Un piccolo problema di React risolto: `useEffect` non necessario

Il primo tentativo per azzerare lo zoom ad ogni cambio pagina usava un `useEffect`:

```js
useEffect(() => {
  setZoomScale(1);
}, [currentIndex, mode]);
```

Sembra ragionevole ("quando cambia la pagina o la modalità, azzera lo zoom"), ma React stesso segnala questo pattern come da evitare (regola `react-hooks/set-state-in-effect`): chiamare `setState` dentro un effect **solo** per sincronizzare due pezzi di stato dello stesso componente causa un doppio giro di rendering inutile (prima si renderizza con lo stato vecchio, poi l'effect scatta e forza un secondo rendering con lo stato corretto).

La correzione: invece di "osservare" il cambiamento e reagire dopo, si azzera lo zoom **nello stesso momento** in cui si cambia pagina o modalità, dentro le funzioni stesse:

```js
function goToNext() {
  setCurrentIndex((index) => clampIndex(index + step));
  setZoomScale(1);
}
```

Regola pratica utile: **`useEffect` serve per sincronizzarsi con qualcosa di esterno a React** (un timer, un'API del browser, una sottoscrizione) — se invece si sta solo reagendo a un cambiamento di stato interno del componente per aggiornare un altro stato interno, quasi sempre conviene aggiornarli insieme, nello stesso gestore di evento, invece di usare un effect.

---

## ✅ Come verificare che funzioni

Verificato con un CBZ reale (23 pagine), simulando eventi del mouse/touch via codice:

- **Tap laterali**: tap a sinistra in lettura giapponese avanza (1→2), tap a destra torna indietro (2→1) — verificato anche che in modalità scroll continuo i tap laterali non facciano nulla (non ha senso "cambiare pagina" mentre si scorre liberamente)
- **Tap centrale**: nasconde e poi ri-mostra correttamente barra strumenti e navigazione, sia in modalità pagina singola sia in scroll continuo
- **Doppio tap**: passa correttamente da pagina singola a doppia pagina e viceversa
- **Pinch**: verificato a livello di calcolo (distanza raddoppiata → zoom raddoppiato, clamping a 3× rispettato) simulando gli eventi touch via codice — **il test su un vero touchscreen resta da fare**
- Zoom azzerato correttamente cambiando pagina o modalità
- Nessun errore in console, nessuna richiesta di rete fallita

---

## 🔜 Prossimi passi

Con questa fase si chiude il proof-of-concept del Lettore: formati (CBZ/CBR), modalità di visualizzazione e controlli sono tutti a posto. La Fase 7 introduce IndexedDB (tramite Dexie.js) — il "motore dati" su cui costruire la vera libreria, l'import multiplo e la persistenza dei progressi di lettura, ancora senza interfaccia.
