# Fase 9 — Categorizzazione manuale

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase introduce i **form controllati** (input i cui valori sono gestiti da React) e la prima **composizione di componenti** vera del progetto: un componente figlio che comunica col genitore tramite callback.

---

## 🎯 Obiettivo della fase

Nella Fase 8 i file importati finivano tutti in una lista "Da categorizzare", senza serie né volume. Questa fase costruisce il **form** con cui l'utente assegna a ciascun file la sua Serie, il suo Volume e il suo numero di Capitolo — salvando l'associazione nel database (Dexie/IndexedDB della Fase 7).

Il flusso pensato: accanto a ogni file "da categorizzare" c'è un pulsante **Categorizza**; premendolo si apre una finestra (un *modal*) con il form; al salvataggio il capitolo esce dalla lista "da categorizzare" ed entra nella struttura Serie → Volume → Capitolo.

---

## 🧩 Un componente separato: `CategorizeForm`

Finora ogni schermata (Libreria, Lettore, Impostazioni) era un unico componente. Qui, per la prima volta, ne creiamo uno **riutilizzabile e dedicato** a un compito preciso — il form di categorizzazione — in [`src/components/CategorizeForm.jsx`](../../src/components/CategorizeForm.jsx), separato dalla pagina Libreria.

Perché separarlo invece di scrivere tutto dentro `Library.jsx`? Due motivi pratici:

- **Leggibilità:** la Libreria si occupa di import ed elenco; il form si occupa dei suoi campi e della sua logica. Tenere le due cose separate rende ciascun file più corto e più facile da capire.
- **Confini chiari:** il form riceve *solo* ciò che gli serve e restituisce *solo* il risultato, senza sapere nulla del resto della Libreria.

### Props e callback: come parlano genitore e figlio

Un componente figlio riceve dati dal genitore tramite le **props** (proprietà, come attributi di un tag). `CategorizeForm` ne riceve tre:

```jsx
<CategorizeForm
  chapter={categorizing}          // quale capitolo sto categorizzando
  onCancel={() => setCategorizing(null)}   // "ho annullato"
  onDone={() => { setCategorizing(null); refresh(); }}   // "ho salvato"
/>
```

`chapter` è un dato (il capitolo). `onCancel` e `onDone` sono **funzioni**: è il modo in cui un figlio "avvisa" il genitore che è successo qualcosa. Il form non chiude sé stesso e non ricarica la lista: **non è affar suo**. Quando l'utente salva, il form chiama `onDone()`, e sta al genitore (la Libreria) decidere cosa fare — qui: chiudere il modal e ricaricare l'elenco. Questo schema "il figlio notifica, il genitore decide" è uno dei pattern più importanti di React.

Dal lato della Libreria, aprire il form è semplicemente ricordare *quale* capitolo si sta categorizzando, in un pezzo di stato:

```jsx
const [categorizing, setCategorizing] = useState(null);
// ...
<button onClick={() => setCategorizing(chapter)}>Categorizza</button>
// ...
{categorizing && <CategorizeForm chapter={categorizing} ... />}
```

Se `categorizing` è `null`, il form non viene renderizzato; appena diventa un capitolo, il modal compare. È lo stesso `condizione && <Componente />` già visto per messaggi ed errori nelle fasi precedenti — qui applicato a un'intera finestra.

---

## ✍️ I form controllati

In React, il modo idiomatico di gestire un campo di input è il **form controllato**: il valore del campo non vive nel DOM (come in una pagina HTML classica), ma in uno stato React, e ogni modifica passa da lì.

```jsx
const [newSeriesTitle, setNewSeriesTitle] = useState('');
// ...
<input value={newSeriesTitle} onChange={(event) => setNewSeriesTitle(event.target.value)} />
```

Due metà inseparabili:

- `value={newSeriesTitle}` — il campo mostra *sempre* quello che dice lo stato React (React è la "fonte di verità").
- `onChange={...}` — ogni tasto premuto aggiorna lo stato, che a sua volta aggiorna il campo.

Sembra un giro tortuoso ("perché non lasciare che il campo si gestisca da solo?"), ma il vantaggio è enorme: il valore è sempre disponibile in JavaScript, pronto per essere validato, trasformato o salvato, senza doverlo "andare a leggere" dal DOM. Tutti i campi del form (serie scelta, titolo nuova serie, volume, numero capitolo) sono controllati così.

### Campi che appaiono in base ad altri campi

Il form non è statico: cambia forma a seconda delle scelte. Se scegli **una serie esistente**, appare il menu dei suoi volumi; se scegli **"➕ Nuova serie"**, appaiono invece i campi per crearla (e il volume sarà per forza nuovo, perché una serie appena creata non ha volumi):

```jsx
{seriesChoice !== '' && !creatingNewSeries && (
  <label>Volume <select>…</select></label>
)}
{volumeChoice === NEW && (
  <label>Numero nuovo volume <input type="number" /></label>
)}
```

Anche questo è solo rendering condizionale (`&&`) — ma applicato ai *campi del form*, il che rende l'interfaccia "viva": mostra solo ciò che serve, quando serve.

---

## 🔗 Caricare dati che dipendono da altre scelte

Il menu dei volumi dipende dalla serie scelta: finché non scegli una serie, non ha senso caricarne i volumi. Questo "caricamento su richiesta" si esprime con un `useEffect` che dipende dalla scelta della serie:

```jsx
useEffect(() => {
  if (seriesChoice === '' || seriesChoice === NEW) return; // niente da caricare
  let cancelled = false;
  (async () => {
    const list = await getVolumesForSeries(Number(seriesChoice));
    if (!cancelled) setVolumes(list);
  })();
  return () => { cancelled = true; };
}, [seriesChoice]);
```

L'array `[seriesChoice]` in fondo dice a React: "riesegui questo effetto ogni volta che cambia la serie scelta". La struttura `let cancelled … return () => { cancelled = true; }` è la stessa "guardia" già vista in Fase 8: se l'utente cambia serie mentre un caricamento è ancora in corso, il risultato vecchio (ormai superato) non sovrascrive quello nuovo.

### Un dettaglio: dove azzerare lo stato collegato

Quando si cambia serie, la scelta del volume fatta prima non ha più senso. La si azzera **nel gestore del cambiamento**, non in un effetto:

```jsx
function handleSeriesChange(value) {
  setSeriesChoice(value);
  setVolumes([]);
  setVolumeChoice(value === NEW ? NEW : '');
  setNewVolumeNumber('');
}
```

È lo stesso principio già emerso in Fase 6: se un cambiamento di stato ne implica un altro *nello stesso componente*, conviene farli insieme, nel punto in cui l'evento accade — invece di "osservare" il primo con un `useEffect` per aggiornare il secondo (cosa che React stesso sconsiglia).

---

## 💾 Il salvataggio: "trova o crea"

Al submit, il form deve tradurre le scelte dell'utente in id concreti da salvare. La logica è "trova o crea": se la serie è esistente si usa il suo id; se è nuova, la si crea prima e si usa l'id appena generato. Idem per il volume.

```js
let seriesId;
if (creatingNewSeries) {
  seriesId = await addSeries(newSeriesTitle.trim());
} else {
  seriesId = Number(seriesChoice);
}

let volumeId;
if (volumeChoice === NEW) {
  volumeId = await addVolume(seriesId, Number(newVolumeNumber));
} else {
  volumeId = Number(volumeChoice);
}

await categorizeChapter(chapter.id, { seriesId, volumeId, number });
onDone();
```

Nota `Number(...)`: i valori che arrivano dai `<select>` e dagli `<input>` sono sempre **stringhe** (`"1"`, non `1`), anche per un input di tipo `number`. Prima di usarli come id o come numeri li convertiamo esplicitamente. È una delle sviste più comuni: senza la conversione, `"1" === 1` è falso e i confronti/salvataggi si comportano in modo inatteso.

Prima di salvare, il form **valida**: serie scelta, volume scelto, numero di capitolo valido. Se qualcosa manca, mostra un messaggio ed evita di salvare a metà.

### Le nuove funzioni del motore dati

In [`src/db.js`](../../src/db.js) sono state aggiunte due letture di supporto al form — `getAllSeries()` (per il menu delle serie) e `getVolumesForSeries(seriesId)` (per il menu dei volumi) — ed è stata estesa `categorizeChapter` perché ora salva anche il **numero di capitolo**, non solo serie e volume.

---

## ✅ Come verificare che funzioni

Verificato in sviluppo (con capitoli "da categorizzare" inseriti direttamente nel database, non essendo automatizzabile il selettore file nativo):

- **Nuova serie + nuovo volume:** categorizzando il primo file creando serie "One Piece" e volume 1 → serie, volume e capitolo (numero 1) salvati correttamente; il file sparisce da "Da categorizzare".
- **Serie e volume esistenti:** categorizzando un secondo file scegliendo la serie "One Piece" già creata → compare il menu con "Volume 1"; salvando, **nessuna serie/volume duplicata** viene creata (riusa quelle esistenti), il capitolo prende numero 2.
- **Menu volumi dinamico:** scegliere una serie esistente carica e mostra i suoi volumi; scegliere "Nuova serie" nasconde il menu volumi e mostra i campi di creazione.
- **Validazione:** premere "Salva" senza compilare mostra il messaggio d'errore e non chiude il form.
- **Annulla:** chiude il form senza modificare nulla.
- Nessun errore in console.

---

## 🔜 Prossimi passi

Ora la libreria ha una struttura vera (Serie → Volumi → Capitoli), ma non c'è ancora una schermata per **navigarla**: i capitoli categorizzati semplicemente escono dalla lista "Da categorizzare" e per ora "scompaiono" dalla vista. La **Fase 10** costruirà la vista Libreria vera e propria — navigazione gerarchica a tre livelli, miniature di anteprima, e il collegamento che apre un capitolo nel Lettore (usando l'handle salvato in Fase 8, con la riconferma del permesso di lettura al primo tocco della sessione).
