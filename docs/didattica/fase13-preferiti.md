# Fase 13 — Preferiti

> Documentazione didattica, scritta per chi non ha mai visto React prima. Fase più piccola delle ultime, ma con un problema classico da risolvere: due componenti "fratelli" (non genitore-figlio) che devono restare in sincronia senza conoscersi direttamente.

---

## 🎯 Obiettivo della fase

Permettere di marcare Serie, Volumi e Capitoli come preferiti (una stella ☆/★ da toccare), e mostrarli in una sezione dedicata della Libreria — così ritrovi rapidamente i manga che ti stanno più a cuore, senza dover risalire tutta la gerarchia ogni volta.

Il campo `favorite` sulla serie esisteva già dalla Fase 7 (mai collegato a un'interfaccia); questa fase lo generalizza a tutti e tre i livelli e lo rende visibile.

---

## 🔁 Un "vero" toggle, non un semplice setter

La funzione originaria era `toggleFavorite(seriesId, favorite)`: chi la chiamava doveva già sapere il valore attuale per passare quello opposto. Le tre nuove funzioni, una per livello, funzionano diversamente — **si informano da sole**:

```js
export async function toggleSeriesFavorite(seriesId) {
  const series = await db.series.get(seriesId);
  if (!series) return;
  await db.series.update(seriesId, { favorite: !series.favorite });
}
```

Legge la riga, inverte il campo, riscrive. Chi chiama non deve tenere traccia di nulla: `toggleSeriesFavorite(id)` fa sempre "il contrario di adesso". È un'API più semplice da usare correttamente — e, come si vedrà tra poco, anche da testare per errore.

---

## 🧩 Riconoscere codice che si ripete: estrarre un helper

Le sezioni "in corso"/"ultimi letti" (Fase 12) avevano già una funzione che, a partire da una riga di progresso, recuperava capitolo/serie/volume e restituiva un oggetto pronto da mostrare. Servendo lo stesso identico bisogno per i capitoli preferiti — recuperare serie e volume di un capitolo — invece di duplicare quella logica, è stata estratta in una funzione più piccola e generica:

```js
async function enrichChapter(chapter, extra = {}) {
  if (!chapter) return null;
  const [series, volume] = await Promise.all([...]);
  return { chapterId: chapter.id, chapterNumber: chapter.number, seriesTitle: series?.title ?? null, /* ... */, ...extra };
}
```

`enrichProgressRows` (Fase 12) ora chiama `enrichChapter` passandogli i campi di progresso come `extra`; `getFavoriteChapters` fa lo stesso senza `extra`. Un dettaglio JavaScript: `{ ...extra }` alla fine dell'oggetto restituito fa sì che eventuali campi in `extra` **sovrascrivano** quelli con lo stesso nome definiti prima — l'ordine delle proprietà nello spread conta.

Questo è un esempio pratico di **refactoring per riuso**: non si scrive codice "generico" in anticipo pensando a usi futuri ipotetici (violerebbe il principio di non costruire per bisogni che non ci sono ancora) — si aspetta che un secondo caso d'uso reale emerga, e *solo allora* si estrae ciò che è davvero in comune.

---

## 🌉 Due componenti fratelli che devono parlarsi

Qui sta la parte concettualmente più interessante della fase. In `Library.jsx` convivono due componenti indipendenti:

- **`Catalog`**: dove si naviga la gerarchia e si può mettere/togliere una stella
- **`Favorites`**: la sezione dedicata, che mostra l'elenco dei preferiti

Toccare una stella nel Catalogo deve aggiornare la sezione Preferiti. Ma sono **fratelli**: nessuno dei due è genitore dell'altro, quindi non possono chiamarsi le funzioni a vicenda direttamente. In React, quando due fratelli devono coordinarsi, la soluzione è far salire la comunicazione al genitore comune — qui, `Library`.

### Perché non semplicemente "rimonta tutto"?

Per la categorizzazione (Fase 9/10) si era già usato un trucco simile: cambiare la prop `key` del Catalogo per farlo rimontare da zero. Qui però **non va bene**: se l'utente ha navigato dentro *Serie → One Piece → Volume 1* e tocca una stella su un capitolo, rimontare il Catalogo lo farebbe **tornare al livello Serie** — un salto indietro fastidioso per un'azione che dovrebbe essere minima.

La soluzione: il Catalogo **si ricarica da solo** (richiama la sua funzione `reloadCurrentLevel`, la stessa già usata dopo una rimozione in Fase 11 — resta al livello in cui si trova) e in più avvisa il genitore tramite una callback:

```jsx
async function toggleFavorite(kind, id) {
  await FAVORITE_TOGGLES[kind](id);
  await reloadCurrentLevel();
  onFavoriteChanged?.();   // "è cambiato qualcosa, occupatene tu"
}
```

`Library` riceve l'avviso e incrementa un contatore, usato come `key` — ma stavolta **solo per `Favorites`**, non per il Catalogo:

```jsx
const [favoritesVersion, setFavoritesVersion] = useState(0);
// ...
<Favorites key={favoritesVersion} onLibraryChanged={...} />
// ...
<Catalog onFavoriteChanged={() => setFavoritesVersion((v) => v + 1)} />
```

Il risultato: il Catalogo si aggiorna sul posto (nessun salto di livello), mentre `Favorites` — che non ha "un posto" da cui saltare, mostra solo un elenco — si permette il lusso di rimontare completamente e ripartire pulito. Stessa idea della Fase 10 (il trucco della `key`), applicata con più cura a **quale** componente conviene rimontare e quale no.

### Una sincronia volutamente incompleta

Il percorso inverso — togliere un preferito da dentro `Favorites` — **non** avvisa il Catalogo. Se in quel momento la stella di quell'elemento fosse visibile a video nel Catalogo, resterebbe piena finché non navighi di nuovo in quel punto. È una scelta consapevole: il Catalogo si aggiorna comunque ad ogni navigazione (`openSeries`/`openVolume` ricaricano sempre i dati freschi), quindi il disallineamento è minimo e temporaneo — evitare di aggiungere un secondo canale di notifica (Favorites → Library → Catalog) tiene il codice più semplice, per un beneficio che sarebbe quasi impercettibile all'uso.

---

## 🚫 Un pulsante o due, a seconda di cosa si può fare

Nel Catalogo, una card ha sempre **due** pulsanti oltre a quello principale (apri): stella e cestino, fianco a fianco (Fase 11 aveva già introdotto questo schema — mai pulsanti annidati). In `Favorites`, invece, le card di **serie e volumi** hanno un solo pulsante: dato che non c'è "un posto dove aprirle" da qui, l'intera card fa sia da anteprima sia da azione "togli dai preferiti". Le card dei **capitoli**, che invece si aprono nel Lettore, tornano ad avere due pulsanti separati — stessa ragione della Fase 11: un'area apre, l'altra rimuove, e sono due azioni distinte che non possono condividere lo stesso elemento cliccabile.

---

## ✅ Come verificare che funzioni

Testato con dati nel database (i toggle sono pura logica, verificabile senza file veri):

- **Toggle a tutti e tre i livelli**: attivato/disattivato correttamente su serie, volume e capitolo; un secondo toggle sullo stesso elemento lo riporta allo stato di partenza (vero toggle, non un "solo accendi").
- **Arricchimento**: i volumi preferiti mostrano il titolo della serie collegata; i capitoli preferiti includono l'handle (necessario per aprirli).
- **Sezione dedicata**: compaiono correttamente "Serie preferite", "Volumi preferiti", "Capitoli preferiti" (ciascuna solo se ha almeno un elemento); assente del tutto quando non ci sono preferiti.
- **Sincronia Catalogo → Preferiti**: toccando la stella su una serie nel Catalogo, la sezione Preferiti si aggiorna subito, senza che il Catalogo perda il livello di navigazione in cui si trovava.
- **Togliere dai Preferiti**: dalla sezione dedicata, toccando una card di serie/volume o la stella su un capitolo, l'elemento sparisce dall'elenco.
- **Apertura di un capitolo preferito**: stesso flusso di permesso-durante-il-gesto delle altre sezioni; con un handle non valido, errore gestito senza blocchi.
- Nessuna regressione: import e categorizzazione continuano a funzionare con il nuovo campo `favorite` di default su volumi e capitoli.

**Da verificare sul dispositivo/browser reale (non automatizzabile qui):** aprire davvero un capitolo preferito con un file vero (stesso limite delle fasi precedenti — richiede un handle autentico, non simulabile in un ambiente automatizzato).

---

## 🔜 Prossimi passi

La **Fase 14** aggiunge ricerca testuale e ordinamento nella libreria — utile ora che ci sono più modi per navigarla (catalogo gerarchico, sezioni di lettura, preferiti) e potrebbe crescere in fretta.
