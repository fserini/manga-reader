# Fase 17 — Tema chiaro/scuro

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase introduce la **Context API**, il primo strumento nativo di React per condividere uno stato tra componenti lontani nell'albero, senza passarlo a mano livello per livello.

---

## 🎯 Obiettivo della fase

Permettere all'utente di scegliere manualmente un tema chiaro o scuro, oppure lasciare che l'app segua l'impostazione del sistema operativo (comportamento già esistente da prima di questa fase). La scelta va ricordata tra una visita e l'altra.

---

## 🧩 Il punto di partenza: un tema che segue solo il sistema

Fin dalla Fase 1, `index.css` definisce i colori dell'app come **variabili CSS** su `:root` (i valori "chiari", di default) e li ridefinisce dentro una *media query* quando il sistema preferisce il buio:

```css
:root {
  --bg: #ffffff;
  --text: #1f2023;
  /* ... */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121212;
    --text: #e5e5e5;
    /* ... */
  }
}
```

Questo approccio è puramente CSS: nessun JavaScript coinvolto, il browser applica da solo il blocco giusto in base alle preferenze di sistema. Funziona bene, ma ha un limite: **non c'è modo di scegliere un tema diverso da quello del sistema**. Se il tablet è impostato su scuro, l'app è scura, punto.

---

## 🙋 Il problema da risolvere: uno stato che serve ovunque

Per aggiungere un selettore manuale serve una scelta ("chiaro" / "scuro" / "sistema") che:

1. viene impostata in un punto solo dell'app (la pagina Impostazioni);
2. deve influenzare l'intera interfaccia, cioè ogni pagina e componente, non solo quello che contiene il selettore;
3. va ricordata dopo un ricaricamento della pagina.

Il punto 2 è quello nuovo. Finora, in tutto il progetto, quando due componenti dovevano scambiarsi informazioni si è sempre usato lo schema "props verso il basso, callback verso l'alto" tra **genitore diretto e figli diretti** (es. `Library` che passa `onFavoriteChanged` a `Catalog`). Ma "Impostazioni" e, per dire, "Libreria" non sono né genitore né figlio l'uno dell'altro: sono due pagine sorelle, entrambe figlie di `App`. Passare il tema con le props significherebbe farlo transitare attraverso `App` e ogni componente intermedio, anche quelli a cui il tema non interessa affatto — il classico "prop drilling".

---

## 🧰 La soluzione: Context API

React offre per questo esatto scenario la **Context API**: un modo per rendere un valore disponibile a *qualunque* componente discendente, a qualunque profondità, senza passarlo esplicitamente per ogni livello intermedio.

Tre pezzi, tutti in [`src/ThemeContext.jsx`](../../src/ThemeContext.jsx):

### 1. Il Context: un "canale" condiviso

```js
const ThemeContext = createContext(null);
```

`createContext` crea un contenitore vuoto. Da solo non fa nulla: serve un **Provider** che gli dia un valore, e un modo per i componenti di leggerlo.

### 2. Il Provider: chi possiede lo stato

```jsx
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next) {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
```

`ThemeProvider` è un componente come un altro, con una particolarità: invece di renderizzare qualcosa di visibile, avvolge `children` (tutto ciò che gli viene messo dentro) in `<ThemeContext.Provider>`, passandogli un `value`. Da questo punto in giù nell'albero, **ogni componente discendente può accedere a quel `value`**, indipendentemente da quanti livelli lo separano dal Provider.

In [`src/main.jsx`](../../src/main.jsx), `ThemeProvider` avvolge l'intera app, un solo gradino sopra `BrowserRouter`:

```jsx
<ThemeProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</ThemeProvider>
```

Questo garantisce che *qualunque* pagina o componente futuro possa leggere il tema, senza dover modificare `App.jsx` o le rotte.

### 3. L'hook `useTheme`: chi legge lo stato

```js
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve essere usato dentro un ThemeProvider');
  }
  return context;
}
```

Un hook molto sottile: chiama l'hook nativo `useContext` (la controparte in lettura di `createContext`) e restituisce quello che il Provider più vicino ha messo in `value`. Il controllo `if (!context)` è una rete di sicurezza: se qualcuno chiamasse `useTheme()` da un componente fuori dall'albero avvolto dal Provider, `useContext` restituirebbe `null` (il valore di default passato a `createContext`) e l'errore esplicito è più facile da diagnosticare di un fallimento silenzioso più avanti nel codice.

In [`Settings.jsx`](../../src/pages/Settings.jsx), usarlo è immediato:

```js
const { theme, setTheme } = useTheme();
```

Nessuna prop, nessun import di più livelli: `Settings` dichiara semplicemente "mi serve il tema" e lo ottiene.

---

## 🎨 Dal valore JavaScript ai colori a schermo: `data-theme`

Avere `theme` in JavaScript non basta: bisogna che i colori dell'interfaccia cambino davvero. Il collegamento è un **attributo HTML sulla radice del documento**, impostato con JavaScript puro (non c'entra React) e letto dal CSS:

```js
function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
```

`document.documentElement` è il tag `<html>`. Con tema "sistema" non si tocca nulla (si torna al comportamento originale, guidato solo dalla media query); con "chiaro" o "scuro" si scrive `<html data-theme="dark">`, un gancio che `index.css` può intercettare.

In `index.css`, il blocco scuro esistente va quindi reso condizionale, e se ne aggiunge uno per la scelta esplicita:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #121212;
    /* ... */
  }
}

:root[data-theme='dark'] {
  --bg: #121212;
  /* ... */
}
```

Il primo blocco dice: "se il sistema preferisce il buio, applica i colori scuri — **a meno che** l'utente non abbia forzato esplicitamente il chiaro". Il secondo dice: "se l'utente ha scelto esplicitamente scuro, applica questi colori, indipendentemente dal sistema" — e per come funziona la specificità CSS, un selettore su un attributo specifico (`:root[data-theme='dark']`), fuori da qualunque media query, vince sempre sulla regola di base `:root`. Tra i due blocchi si copre ogni combinazione: sistema chiaro/scuro incrociato con nessuna scelta / chiaro / scuro esplicito.

---

## ⏱️ Un dettaglio temporale: perché `useLayoutEffect` e non `useEffect`

Il `ThemeProvider` applica il tema dentro `useLayoutEffect`, non nel più comune `useEffect`. La differenza è *quando* la funzione gira rispetto al disegno a schermo:

- `useEffect` gira **dopo** che il browser ha già dipinto il frame;
- `useLayoutEffect` gira **prima**, in modo sincrono, bloccando il disegno finché non ha finito.

Perché conta qui: al primo caricamento della pagina, React monta i componenti con un tema di partenza (quello letto da `localStorage`), ma l'attributo `data-theme` sul tag `<html>` non esiste ancora finché l'effetto non lo imposta. Se quell'effetto girasse dopo il disegno (`useEffect`), l'utente vedrebbe per una frazione di secondo il tema "sbagliato" (quello di sistema) prima che scatti quello scelto — un lampo fastidioso, specialmente passando da scuro a chiaro o viceversa. Con `useLayoutEffect`, l'attributo è già al suo posto quando il browser disegna per la prima volta.

---

## 💾 Persistenza: `localStorage`, non IndexedDB

A differenza dei dati della libreria (Fase 7 in poi), qui non si usa Dexie/IndexedDB: è uno strumento pensato per collezioni di dati strutturati, non per un singolo valore di preferenza. Per questo basta l'API più semplice del browser, `localStorage`: una coppia chiave-valore testuale, sincrona, che sopravvive alla chiusura della scheda.

```js
const STORAGE_KEY = 'manga-reader-theme';

function readStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID_THEMES.includes(stored) ? stored : 'system';
}
```

`readStoredTheme` viene passata come **funzione** a `useState(readStoredTheme)`, non chiamata (`useState(readStoredTheme())`). È lo schema dell'"inizializzatore lazy" di `useState`: passata come funzione, React la esegue una sola volta, al primo render; passata già eseguita, girerebbe ad ogni render (inutilmente, dato che serve solo per il valore iniziale). La validazione con `VALID_THEMES.includes(...)` è una piccola difesa contro un valore corrotto o obsoleto eventualmente rimasto in `localStorage` (es. da una versione futura dell'app con opzioni diverse): se non è uno dei tre valori noti, si ricade su `'system'` invece di propagare un valore invalido nell'interfaccia.

---

## 🖱️ L'interfaccia in Impostazioni

Tre pulsanti che si comportano come un gruppo di opzioni esclusive (`role="radiogroup"` / `role="radio"` sul contenitore e su ciascun bottone, per l'accessibilità — comunicano a chi usa uno screen reader che è un insieme di scelte mutuamente esclusive, anche se visivamente sono pulsanti e non i classici cerchietti `<input type="radio">`):

```jsx
{THEME_OPTIONS.map((option) => (
  <button
    key={option.value}
    role="radio"
    aria-checked={theme === option.value}
    className={theme === option.value ? 'settings-theme-active' : ''}
    onClick={() => setTheme(option.value)}
  >
    {option.label}
  </button>
))}
```

Ogni click chiama `setTheme(option.value)`, che a sua volta scrive su `localStorage` e aggiorna lo stato React — il che fa ripartire `useLayoutEffect` nel Provider, che aggiorna `data-theme`, che fa scattare le regole CSS. Una catena di causa-effetto in un'unica direzione, lo stesso pattern visto in tutte le fasi precedenti, qui applicato per la prima volta attraverso un Context invece che tra genitore e figlio diretti.

---

## ✅ Come verificare che funzioni

Verificato nell'ambiente sandbox (sistema impostato su tema scuro):

- **Tema "Sistema"** (default): l'interfaccia è scura, coerente col sistema — comportamento identico a prima di questa fase.
- **Tema "Chiaro" forzato**: l'interfaccia diventa chiara nonostante il sistema sia scuro; il pulsante "Chiaro" resta evidenziato come attivo.
- **Persistenza**: dopo un reload completo della pagina, il tema scelto ("Chiaro") resta applicato, senza lampi del tema di sistema durante il caricamento.
- **Nessun errore in console** in nessuno degli scenari sopra.
- `npm run lint` pulito (un solo avviso di `react-refresh/only-export-components` su `useTheme`, silenziato deliberatamente con un commento che ne spiega il motivo: tenere l'hook nello stesso file del Context che consuma è più semplice di uno split su più file, al costo di un mancato hot-reload mirato in sviluppo — nessun impatto in produzione).

Da verificare sul dispositivo reale (fuori dalla portata dell'ambiente sandbox):
- Comportamento con il tablet impostato su tema chiaro di sistema (qui sempre testato con sistema scuro).
- Che il cambio di tema di sistema *mentre l'app è aperta* con tema "Sistema" selezionato aggiorni i colori in tempo reale (atteso: sì, essendo pura media query CSS, ma non verificabile senza poter cambiare davvero l'impostazione del sistema operativo durante il test).

---

## 🔜 Prossimi passi

**Fase 18** introduce l'internazionalizzazione: selezione della lingua (italiano/inglese) con lo stesso tipo di esigenza — una preferenza scelta in Impostazioni ma che deve valere per tutta l'app — quindi un candidato naturale a un secondo Context, o a un'estensione di quello esistente.
