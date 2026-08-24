# Fase 12 — Progresso di lettura

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase collega finalmente il Lettore e la Libreria al database: l'app comincia a **ricordare** dove sei arrivato. Introduce il salvataggio automatico come "effetto collaterale" e un paio di trappole classiche (dati derivati, ordine dei salvataggi).

---

## 🎯 Obiettivo della fase

Fare in modo che l'app tenga traccia di quanto hai letto:

- **Segnalibro automatico**: riaprendo un capitolo si riparte dall'ultima pagina letta.
- **Segnalibro manuale**: un pulsante per marcare *esplicitamente* una pagina, indipendente dal segnalibro automatico.
- **Indicatore di completamento** per capitolo e volume, nel catalogo.
- Sezioni **"In corso di lettura"** e **"Ultimi letti"** nella Libreria.

Il motore dati per tutto questo esisteva già da Fase 7 (`updateReadingProgress`, `setManualBookmark`, ...): questa fase soprattutto lo **collega** all'interfaccia.

---

## 🐛 Un bug latente scoperto ora: `put` cancella i dati

`updateReadingProgress` salvava così:

```js
db.readingProgress.put({ chapterId, lastPageRead, totalPages, lastReadAt: Date.now() });
```

`put` in un database **sostituisce l'intera riga**. Finché salvavamo solo il progresso automatico andava bene. Ma ora esiste anche il segnalibro manuale (`manualBookmarkPage`) nella *stessa* riga: con quel `put`, ogni cambio di pagina avrebbe **cancellato il segnalibro manuale**, perché il nuovo oggetto non lo includeva.

La correzione è un **read-modify-write**: leggi la riga esistente, fondi i nuovi campi, riscrivi:

```js
export async function updateReadingProgress(chapterId, { lastPageRead, totalPages }) {
  const existing = await db.readingProgress.get(chapterId);
  return db.readingProgress.put({ ...existing, chapterId, lastPageRead, totalPages, lastReadAt: Date.now() });
}
```

`{ ...existing, ... }` copia prima tutti i campi già presenti (incluso `manualBookmarkPage`), poi sovrascrive solo quelli nuovi. Regola pratica: quando più informazioni indipendenti vivono nella stessa riga, un `put` "secco" è pericoloso — o si fondono i campi, o si separano in righe diverse.

---

## 💾 Salvare come "effetto collaterale": `useEffect` fatto bene

Il salvataggio automatico deve avvenire ogni volta che cambia la pagina corrente. Qui `useEffect` è lo strumento **giusto** (a differenza dei casi visti prima in cui andava evitato):

```jsx
useEffect(() => {
  if (!chapterId || totalPages === 0) return;
  updateReadingProgress(Number(chapterId), { lastPageRead: currentIndex, totalPages });
}, [chapterId, currentIndex, totalPages]);
```

La differenza rispetto ai casi "da evitare" delle fasi precedenti: qui **non** stiamo chiamando `setState` dentro l'effetto (cosa che innesca ri-render a catena). Stiamo **sincronizzando con un sistema esterno** — il database — che è esattamente lo scopo per cui `useEffect` esiste. L'array `[chapterId, currentIndex, totalPages]` dice "risalva ogni volta che cambia la pagina". Nessun ciclo, nessun render extra: solo una scrittura su IndexedDB quando serve.

### L'insidia dell'ordine: non salvare uno "0" fasullo

C'è una trappola sottile nel ripristino. Quando apri un capitolo, `currentIndex` parte da 0, poi va impostato all'ultima pagina salvata. Se il salvataggio scattasse *tra* questi due momenti, scriverebbe `0` sovrascrivendo il progresso vero.

La soluzione è ripristinare la pagina **nello stesso momento** in cui si mostrano le immagini, non dopo:

```js
let restoreIndex = 0;
if (chapterIdForThumb != null) {
  const progress = await getReadingProgress(chapterIdForThumb);
  if (progress?.lastPageRead > 0) restoreIndex = Math.min(progress.lastPageRead, flatLength - 1);
}
setPageGroups(urlGroups);
setCurrentIndex(restoreIndex);  // insieme a setPageGroups: un solo render, indice già giusto
```

Poiché `setPageGroups` e `setCurrentIndex` sono chiamati uno dopo l'altro (React li raggruppa in un unico aggiornamento), il primo render con le pagine ha già `currentIndex` corretto. L'effetto di salvataggio parte una volta sola, con il valore giusto — nessun "0" fasullo. Nota anche il `Math.min(..., flatLength - 1)`: se il file nel frattempo avesse meno pagine, l'indice resta comunque valido.

---

## 🔖 Segnalibro automatico vs manuale

Sono due cose diverse, di proposito:

- Il **segnalibro automatico** (`lastPageRead`) ti riporta dove eri: cambia da solo mentre leggi.
- Il **segnalibro manuale** (`manualBookmarkPage`) è un punto che *tu* scegli e resta fermo finché non lo sposti — utile per dire "questa pagina voglio ritrovarla", anche se poi sfogli oltre.

Nel Lettore un pulsante fa da interruttore: tocchi per mettere il segnalibro sulla pagina corrente; tocchi di nuovo sulla stessa pagina per toglierlo.

```jsx
function toggleManualBookmark() {
  const nextPage = manualBookmarkPage === currentIndex ? null : currentIndex;
  setManualBookmarkPage(nextPage);
  setManualBookmark(Number(chapterId), nextPage);
}
```

Quando un segnalibro esiste e sei su un'altra pagina, compare un pulsante "Vai al segnalibro" che ti ci riporta.

---

## 📊 Dati "derivati": il completamento non si salva

L'indicatore di completamento (barra di avanzamento, "✓ Letto", "1/2 letti") **non è un dato salvato**: si *calcola* al momento dal progresso già presente.

```js
function isCompleted(progress) {
  return Boolean(progress && progress.totalPages > 0 && progress.lastPageRead >= progress.totalPages - 1);
}
function completionPercent(progress) {
  if (!progress || !progress.totalPages) return 0;
  return Math.round(((progress.lastPageRead + 1) / progress.totalPages) * 100);
}
```

Salvare "completato" come campo a parte sarebbe un errore: due fonti di verità che possono andare in disaccordo (segni "completato" ma `lastPageRead` dice metà — quale credere?). Meglio **una sola fonte** (`lastPageRead`/`totalPages`) da cui tutto il resto discende. È lo stesso principio già visto per la sezione "in corso": "in corso" = *derivato* da "letto di recente ma non completato", non un flag salvato.

Per il volume, il completamento è "quanti capitoli sono completati su quanti": si calcola caricando il progresso dei suoi capitoli e contando.

---

## 🧩 Comporre le sezioni "In corso" e "Ultimi letti"

Queste sezioni ([`ReadingSections.jsx`](../../src/components/ReadingSections.jsx)) mostrano scorciatoie per riprendere. Un dettaglio: le righe di progresso nel database contengono solo `chapterId` e numeri di pagina — non il nome della serie o del capitolo. Per mostrarle serve **arricchirle** con i dati collegati, cosa che fa una funzione nel motore dati:

```js
async function enrichProgressRows(rows) {
  // per ogni progresso: recupera capitolo, poi la sua serie e il suo volume,
  // e restituisce un oggetto "pronto da mostrare" (titolo, numero, copertina, handle...)
}
```

Due accortezze: salta i progressi il cui capitolo non esiste più (riferimento morto), e include l'**handle** del file — perché aprire un capitolo da queste sezioni richiede, come sempre, di chiedere il permesso *durante il gesto* del tocco (stesso vincolo del catalogo in Fase 10), e per farlo l'handle deve essere già in memoria.

Un tocco piacevole "gratis": queste sezioni sono figlie della Libreria, che è una **rotta** diversa dal Lettore. Quando torni dal Lettore alla Libreria, React Router **rimonta** la Libreria da capo — quindi le sezioni si ricaricano da sole e riflettono subito il capitolo appena letto, senza codice aggiuntivo.

---

## ✅ Come verificare che funzioni

Testato in sviluppo con dati nel database (le parti che richiedono file veri sono elencate sotto):

- **Correzione del `put`**: impostato un segnalibro manuale (pag. 7), poi aggiornata la pagina letta a 3 → il segnalibro **resta** 7 (prima veniva cancellato).
- **Liste arricchite**: `getInProgressChapters` restituisce solo i capitoli non completati, con serie/volume/handle corretti; `getRecentlyReadChapters` li ordina dal più recente; un capitolo completato appare in "ultimi letti" ma non "in corso".
- **Sezioni in Libreria**: "In corso di lettura" mostra solo il capitolo a metà; "Ultimi letti" mostra entrambi, ordinati.
- **Indicatori nel catalogo**: capitolo completato → "✓ Letto"; capitolo a metà (pag. 5 di 20) → barra al 25%; volume → "1/2 letti".
- **Lettore in modalità manuale** (senza capitolo di libreria): nessun pulsante segnalibro (giustamente: non c'è dove salvare) e nessun progresso scritto.

**Da verificare sul dispositivo/browser reale (non automatizzabile qui):** aprire un capitolo dalla Libreria, leggere alcune pagine, uscire e riaprire → deve **riprendere dall'ultima pagina**; il segnalibro manuale (metti / vai / togli) e il tracking in modalità scroll (esce e rientra alla stessa altezza). Come nelle fasi precedenti, il round-trip completo richiede un handle di file reale — con handle "finti" nel database non si arriva alla lettura.

---

## 🔜 Prossimi passi

L'app ora ricorda i progressi. La **Fase 13** aggiunge i **preferiti** (marcare serie/volumi/capitoli e una sezione dedicata); la **Fase 14** la ricerca e l'ordinamento nella libreria.
