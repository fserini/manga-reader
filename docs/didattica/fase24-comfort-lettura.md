# Fase 24 — Comfort di lettura

> Prima di quattro fasi (24-27) nate da un'analisi complessiva dell'app alla ricerca di funzionalità mancanti e rifiniture. Questa tocca il Lettore: niente di rivoluzionario, cinque piccoli accorgimenti che tolgono attrito dall'uso quotidiano.

---

## 1. Preferenze di lettura persistenti

Prima, ogni capitolo ripartiva sempre con modalità "singola" e direzione RTL, anche se l'utente le cambiava sistematicamente ad ogni apertura. Ora l'ultima scelta esplicita viene salvata in `localStorage` e usata come punto di partenza del capitolo successivo:

```js
const READING_PREFS_KEY = 'manga-reader:reading-prefs';

function loadReadingPrefs() {
  try {
    const raw = localStorage.getItem(READING_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function updateReadingPrefs(partial) {
  try {
    const current = loadReadingPrefs() ?? {};
    localStorage.setItem(READING_PREFS_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {
    // Storage pieno o non disponibile: la preferenza non persiste, non è un errore bloccante.
  }
}
```

`loadReadingPrefs()` viene letto una sola volta, come inizializzatore lazy dei tre `useState` coinvolti (`mode`, `readingDirection`, `dimLevel`):

```js
const [mode, setMode] = useState(() => loadReadingPrefs()?.mode ?? 'single');
```

Il punto delicato: `updateReadingPrefs` va chiamato **solo** nei gestori che rappresentano una scelta vera dell'utente (`handleModeChange`, `toggleReadingDirection`, il ciclo del filtro notte), mai in un effetto generico che osserva lo stato — altrimenti anche un cambio di modalità automatico (vedi punto 2) finirebbe salvato come se fosse una preferenza.

## 2. Spread automatico in landscape

Ruotando il tablet in orizzontale, se l'utente non ha ancora scelto esplicitamente una modalità per quel capitolo (e non è in scroll), si passa automaticamente a doppia pagina; tornando in verticale, si ripristina l'ultima preferenza salvata.

La parte interessante è evitare una corsa critica tra due effetti entrambi legati a `chapterId`:

- un effetto resetta `explicitModeThisChapterRef.current = false` ad ogni nuovo capitolo — **sincrono**, nello stesso giro di commit
- l'effetto di orientamento legge quel ref per decidere se intervenire

Il reset "vero" dentro `openFile` arriva invece dopo alcuni `await` (permesso, lettura file), quindi troppo tardi per essere visto dall'effetto di orientamento nello stesso render. Per questo il reset è stato duplicato in un effetto dedicato, dichiarato *prima* di quello di orientamento — in React gli effetti di un render girano nell'ordine in cui gli hook sono dichiarati, quindi l'ordine di scrittura nel file conta.

```js
useEffect(() => {
  explicitModeThisChapterRef.current = false;
}, [chapterId]);

useEffect(() => {
  const query = window.matchMedia('(orientation: landscape)');
  function applyOrientation(isLandscape) {
    if (explicitModeThisChapterRef.current || modeRef.current === 'scroll') return;
    setMode(isLandscape ? 'spread' : (loadReadingPrefs()?.mode ?? 'single'));
  }
  function handleChange(event) { applyOrientation(event.matches); }
  applyOrientation(query.matches);
  query.addEventListener('change', handleChange);
  return () => query.removeEventListener('change', handleChange);
}, [chapterId]);
```

`modeRef` è uno specchio di `mode` aggiornato in un terzo effetto: serve perché il listener di `matchMedia` non deve ri-registrarsi ad ogni cambio di modalità (altrimenti l'effetto dovrebbe avere `mode` tra le dipendenze), ma deve comunque leggere il valore *corrente*, non quello catturato alla creazione della closure.

## 3. Swipe oltre al tap

Uno swipe orizzontale affianca (non sostituisce) il tap sui bordi già esistente. Riusa lo stesso schema a `ref` già usato per il pinch-to-zoom (Fase 6): `swipeStateRef` registra il punto di partenza al `touchstart` con un solo dito, `handleTouchEnd` calcola lo spostamento e decide se è uno swipe valido (abbastanza orizzontale, non troppo verticale) o un tap normale che deve proseguire per la sua strada.

Un dettaglio necessario: dopo un touch, il browser genera comunque un evento `click` sintetico. Se lo swipe ha già fatto navigare, quel click andrebbe ignorato — altrimenti si naviga due volte per lo stesso gesto. `ignoreNextClickRef` fa da ponte tra `handleTouchEnd` (che lo imposta) e `handlePagesClick` (che lo controlla per primo e lo consuma).

## 4. Capitolo successivo a fine lettura

Nuova funzione in `db.js`, `getNextChapterInVolume(chapterId)`: trova il capitolo con il numero immediatamente superiore nello stesso volume, riusando `getChaptersForVolume` (già ordinata per numero). Il Lettore la chiama quando apre un capitolo dalla Libreria (non nella modalità file-picker diretta, che non ha un "volume" di riferimento) e mostra un invito quando si raggiunge l'ultima pagina (o ultimo spread):

```js
const isAtChapterEnd = pages.length > 0 && currentIndex + step >= pages.length;
```

L'invito compare da solo, indipendentemente dal pannello controlli (che può essere nascosto) — è informazione di contesto, come il filo di avanzamento, non un controllo da richiamare col tocco.

## 5. Filtro notte

Un velo scuro (`<div>` assoluto, `pointer-events: none`) sopra le sole pagine, non sopra filo di avanzamento e pannello controlli. Invece di uno slider — che avrebbe richiesto un popover su un pannello già compatto a 5 icone — un ciclo a tre livelli (spento/leggero/forte) su un'unica icona, sullo stesso principio del segnalibro (tocca per cambiare stato, icona che riflette lo stato attivo).

## 🩹 Aggiunta durante la fase: rimozione manuale da "In corso" e "Ultimi letti"

Richiesta emersa mentre si lavorava sul Lettore: non c'era modo di togliere un capitolo da "In corso di lettura" o "Ultimi letti" se non continuando a leggerlo fino alla fine (o smettendo semplicemente di vederlo lì, cosa che non succedeva mai da solo). Entrambe le sezioni sono derivate dalla tabella `readingProgress` (ordinata per `lastReadAt`, filtrata per completamento): una nuova `clearReadingProgress(chapterId)` in `db.js` cancella semplicemente quella riga.

Un dettaglio del modello dati: il segnalibro manuale (Fase 12) vive nella **stessa riga** di `readingProgress` del progresso automatico — non sono due cose separate. Rimuovere il progresso rimuove quindi anche un eventuale segnalibro manuale su quel capitolo; il capitolo stesso, e la sua posizione nel Catalogo, non sono invece toccati per nulla.

A differenza della rimozione dal Catalogo (Fase 11, `DeleteDialog`), qui non ha senso offrire la scelta "elimina anche il file fisico": non si sta rimuovendo nulla dalla libreria, solo da due elenchi derivati. Per questo la conferma è un dialog minimale dedicato, non una riproposizione di `DeleteDialog` con opzioni che non si applicherebbero al caso. (Nata dentro `ReadingSections`, è poi diventata il componente condiviso `ConfirmDialog` in Fase 25, quando è servita una seconda volta.)

## Cosa NON è cambiato

- Il pannello controlli resta lo stesso contenitore a icone di Fase 21: l'icona del filtro notte si aggiunge al gruppo azioni esistente, non richiede un redesign (era proprio l'intento dichiarato nel commento originale su `ICON_PROPS`).
- Tap sui bordi, pinch-to-zoom, doppio tap: invariati, lo swipe si affianca senza toccarli.

## Verifica

Verificato in sandbox costruendo a mano un piccolo CBZ di test (un file ZIP "stored" con PNG minimi generati via `CompressionStream`, iniettato nell'`<input type="file">` del Lettore in modalità "apertura diretta" — questa sandbox non ha un file picker nativo, quindi non può aprire un capitolo vero dalla Libreria tramite `FileSystemFileHandle`):

- spread automatico confermato: il viewport della sandbox è più largo che alto (landscape), e il capitolo si apre da solo in doppia pagina
- tornando in viewport verticale (375×812), la modalità rivede quella salvata ("singola"), non landscape
- filtro notte: clic sull'icona cicla i livelli, overlay con l'opacità corretta, preferenza salvata in `localStorage`
- swipe orizzontale: avanza pagina, nessuna doppia navigazione dal click sintetico successivo
- preferenze di modalità/filtro persistono tra una riapertura e l'altra del Lettore
- rimozione manuale: il pulsante "✕" apre il dialog di conferma minimale, il capitolo sparisce da entrambe le sezioni e resta nel Catalogo

**Da verificare su dispositivo reale** (Federico, fuori sandbox): l'invito "Capitolo successivo" (richiede l'apertura di un vero capitolo di libreria con `FileSystemFileHandle`, non simulabile in sandbox) e la rotazione fisica del tablet (qui solo emulata via resize del viewport).
