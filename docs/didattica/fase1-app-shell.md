# Fase 1 — Struttura dell'app (shell)

> Documentazione didattica, scritta per chi non ha mai visto React prima. Spiega **cosa** è stato costruito in questa fase e **perché**, introducendo i concetti di React man mano che servono.

---

## 🎯 Obiettivo della fase

Prima di scrivere qualsiasi logica reale (leggere file, mostrare immagini, salvare dati...), l'app ha bisogno di uno **scheletro**: le viste principali devono esistere (anche vuote) e deve essere possibile spostarsi tra di esse. Questo è lo "shell" dell'applicazione.

In questa fase abbiamo:

- Installato **React Router**, la libreria standard per gestire più "pagine" in un'app React
- Creato tre viste vuote: **Libreria**, **Lettore**, **Impostazioni** (`src/pages/Library.jsx`, `src/pages/Reader.jsx`, `src/pages/Settings.jsx`)
- Aggiunto una barra di navigazione minima in `src/App.jsx` per passare da una vista all'altra
- Collegato tutto nel punto d'ingresso dell'app, `src/main.jsx`

Nessuna logica reale ancora: solo la struttura su cui costruiremo le fasi successive.

---

## 🧩 Concetti di React usati in questa fase

### Cos'è un "componente"

React non funziona per pagine HTML separate come un sito tradizionale: funziona per **componenti**. Un componente è semplicemente **una funzione JavaScript che restituisce dell'interfaccia grafica**. Ad esempio, tutto `src/pages/Library.jsx`:

```jsx
function Library() {
  return (
    <div>
      <h1>Libreria</h1>
      <p>Qui vedrai le tue serie, volumi e capitoli.</p>
    </div>
  );
}

export default Library;
```

è un componente. Si chiama `Library`, non prende parametri, e "restituisce" un pezzo di interfaccia (un titolo e un paragrafo). Da nessuna parte c'è un file `.html` per questa vista: l'HTML viene generato dal componente stesso, a runtime, dentro il browser.

Un'app React è quindi un **albero di componenti**: componenti piccoli (come `Library`) vengono usati dentro componenti più grandi (come `App`), che a loro volta vengono "montati" nella pagina HTML reale.

### Cos'è la sintassi JSX

Il codice tra `return (...)` sopra — `<div><h1>Libreria</h1>...</div>` — **non è HTML**, anche se gli assomiglia moltissimo. È **JSX**, un'estensione di JavaScript che permette di scrivere markup direttamente dentro il codice. Il file si chiama `.jsx` proprio per questo motivo.

Dietro le quinte, Vite (il build tool del progetto) trasforma questo JSX in normali chiamate a funzioni JavaScript prima di mandarlo al browser. Per chi scrive codice, però, l'esperienza è "scrivo HTML dentro JavaScript", il che rende molto naturale descrivere interfacce dinamiche.

Alcune differenze da tenere a mente rispetto all'HTML puro (le vedremo dal vivo più avanti, qui solo un accenno): gli attributi usano il camelCase (es. `className` invece di `class`), e ogni componente deve restituire un unico "blocco" (per questo motivo si racchiude tutto in un `<div>` o simili).

### Il punto d'ingresso: `main.jsx`

Il browser, di suo, non sa cosa sia un "componente React". Da qualche parte serve dire: *"prendi questo elemento HTML reale nella pagina, e disegnaci dentro il mio albero di componenti"*. Questo accade in `src/main.jsx`:

```jsx
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Riga per riga:

- `document.getElementById('root')` prende l'elemento `<div id="root"></div>` che si trova in `index.html` (l'unico file HTML reale di tutta l'app — è per questo che si parla di **Single Page Application**, "applicazione a pagina singola")
- `createRoot(...)` dice a React: "questo è il contenitore dentro cui gestirai tu l'interfaccia da qui in poi"
- `.render(<App />)` disegna il componente principale `App` dentro quel contenitore

`<StrictMode>` è un componente speciale di React che non produce nulla di visibile: attiva solo controlli extra in fase di sviluppo per aiutare a scoprire errori comuni in anticipo (in produzione non ha alcun effetto).

`<BrowserRouter>` invece è il pezzo introdotto in questa fase — vediamolo nel dettaglio.

---

## 🧭 La navigazione con React Router

Un'app React "pura" mostra sempre lo stesso componente: non ha di per sé il concetto di "URL diversi per pagine diverse". **React Router** aggiunge questo concetto, permettendo di collegare un URL (es. `/reader`) a un componente da mostrare (es. `Reader`).

### `BrowserRouter`

È il componente che "attiva" il router per tutta l'app. Va messo una sola volta, il più in alto possibile nell'albero dei componenti (per questo si trova in `main.jsx`, attorno ad `App`). Usa la History API del browser per cambiare URL **senza ricaricare la pagina** — è questo il motivo per cui, cliccando tra le viste, la pagina non "lampeggia" come farebbe un sito tradizionale.

### `Routes` e `Route`

Dentro `src/App.jsx` si trova la mappa vera e propria tra URL e componenti:

```jsx
<Routes>
  <Route path="/" element={<Library />} />
  <Route path="/reader" element={<Reader />} />
  <Route path="/settings" element={<Settings />} />
</Routes>
```

`Routes` guarda l'URL corrente e, tra tutti i `Route` al suo interno, sceglie quello con il `path` corrispondente, renderizzando l'`element` associato. Se l'URL è `/reader`, viene mostrato (ed eseguito) il componente `Reader`; se è `/`, viene mostrato `Library`. È fondamentalmente uno `switch` sull'URL.

### `NavLink`

Per spostarsi tra le viste servono dei link. Si potrebbero usare normali tag `<a href="...">`, ma questi ricaricherebbero l'intera pagina dal server, perdendo tutto il vantaggio di avere una Single Page Application. React Router fornisce `NavLink` (e il più semplice `Link`) proprio per questo: **intercetta il click e cambia URL internamente**, senza richiesta al server.

```jsx
<NavLink to="/">Libreria</NavLink>
```

Abbiamo scelto `NavLink` invece di `Link` pensando già alle fasi successive: `NavLink` sa automaticamente riconoscere se il proprio link corrisponde alla pagina attualmente attiva (utile più avanti per evidenziare la voce di menu selezionata), mentre `Link` è "cieco" a questo.

---

## 📁 Struttura delle cartelle introdotta

```
src/
├── App.jsx           # componente principale: nav + area contenuto (Routes)
├── main.jsx          # punto d'ingresso: monta App nel DOM, attiva il router
└── pages/             # una vista = un file, una per ogni voce della navigazione
    ├── Library.jsx
    ├── Reader.jsx
    └── Settings.jsx
```

La cartella `pages/` è una convenzione (non un requisito tecnico di React): raggruppare lì i componenti che rappresentano intere "viste/schermate", per distinguerli dai componenti più piccoli e riusabili che verranno introdotti più avanti (es. una card di un capitolo, un bottone di navigazione lettore, ecc.), che invece finiranno in una futura cartella `components/`.

---

## ✅ Come verificare che funzioni

1. `npm run dev` per avviare il server di sviluppo
2. Aprire l'app nel browser: deve comparire la vista **Libreria** di default (percorso `/`)
3. Cliccare su "Lettore" e "Impostazioni" nella barra di navigazione: il contenuto cambia senza che la pagina ricarichi (si può verificare osservando che l'URL cambia nella barra degli indirizzi, ma non compare il "flash" bianco tipico di un reload)

Verificato manualmente in questa fase: tutte e tre le viste si aprono correttamente, la navigazione è client-side (nessun reload), nessun errore in console.

---

## 🔜 Prossimi passi

Le tre viste restano vuote (solo titolo + testo segnaposto): la Fase 2 introdurrà la configurazione PWA (manifest, service worker), mentre i contenuti reali delle viste arriveranno a partire dalla Fase 3 (lettura del primo CBZ).
