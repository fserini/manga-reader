# Fase 14 — Ricerca e ordinamento

> Documentazione didattica, scritta per chi non ha mai visto React prima. Fase piccola e concentrata su un'idea sola, ma importante: **derivare** dati per la visualizzazione invece di salvarli come stato a parte.

---

## 🎯 Obiettivo della fase

Due aggiunte al Catalogo:

- **Ricerca testuale**: un campo che filtra l'elenco attualmente mostrato (serie, volumi o capitoli), qualunque sia il livello in cui ci si trova.
- **Ordinamento delle serie**: alfabetico (il comportamento di sempre) oppure "ultimi letti" — le serie con attività di lettura più recente vengono prima.

---

## 🧮 Filtrare e ordinare: dati derivati, non nuovo stato

La tentazione più comune, aggiungendo una ricerca, è creare uno stato apposta per "l'elenco filtrato" e tenerlo sincronizzato con un `useEffect` ogni volta che cambia la query. Non serve: il risultato filtrato/ordinato è **completamente calcolabile** dagli elenchi già caricati (`series`, `volumes`, `chapters`) più la query e l'ordinamento scelto — non è un'informazione nuova, è una **vista diversa** su dati che l'app ha già.

```js
const normalizedQuery = searchQuery.trim().toLowerCase();

const visibleSeries = series
  .filter((item) => !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery))
  .sort((a, b) =>
    sortBy === 'recent'
      ? (seriesLastRead[b.id] ?? 0) - (seriesLastRead[a.id] ?? 0)
      : a.title.localeCompare(b.title, undefined, { numeric: true }),
  );
```

Questo calcolo vive **dentro** la funzione del componente, ricalcolato ad ogni rendering — non in uno stato, non in un effetto. Ogni volta che l'utente digita un carattere, React ri-esegue `Catalog()`, e questo filtro viene rifatto da capo con la query aggiornata. Per gli elenchi coinvolti (decine di elementi, non migliaia) il costo è trascurabile: molto più semplice ed esplicito di tenere sincronizzati due stati paralleli.

Regola pratica, già incontrata in altre forme nelle fasi precedenti (l'indicatore di completamento in Fase 12 è lo stesso principio): **se un dato si può calcolare da altri dati già presenti, non salvarlo a parte**. Meno stato significa meno modi di finire disallineati.

---

## 🔍 Una ricerca che si adatta al livello

Il campo di ricerca è unico, ma cosa filtra dipende da dove ti trovi — non ha bisogno di saperlo esplicitamente, perché ogni livello prepara la propria stringa da confrontare:

```js
const visibleVolumes = volumes.filter(
  (volume) => !normalizedQuery || `volume ${volume.number}`.includes(normalizedQuery),
);
```

Cercando "1" tra i volumi, la stringa generata al volo (`"volume 1"`, `"volume 2"`, ...) viene confrontata con la query — nessun campo "nome" salvato da qualche parte, si ricostruisce la stessa etichetta che l'utente vede a schermo.

### Un dettaglio facile da dimenticare: azzerare la ricerca navigando

Se l'utente cerca "one piece" al livello Serie e poi apre quella serie, la query **resta** nello stato a meno di azzerarla esplicitamente — e "one piece" non troverebbe alcun match tra "Volume 1", "Volume 2"... risultando in una schermata vuota e confusa, con l'utente convinto che la serie non abbia volumi. La correzione è azzerare `searchQuery` in ogni funzione che cambia livello (`openSeries`, `openVolume`, `goToSeries`, `goToVolumes`):

```js
async function openSeries(item) {
  // ...
  setLevel('volumes');
  setSearchQuery('');
}
```

Da notare cosa **non** viene azzerato: l'ordinamento (`sortBy`) sopravvive alla navigazione — è una preferenza dell'utente per la sessione, non legata a "cosa sto cercando adesso", quindi ha senso che resti impostata anche tornando al livello Serie.

---

## 📅 Costruire "ultimi letti" per serie: una mappa d'appoggio

L'ordinamento "ultimi letti" ha bisogno di sapere, per ogni **serie**, quand'è stata letta l'ultima volta — ma il progresso di lettura (Fase 12) è registrato per **capitolo**, non per serie. Serve un piccolo "salto": per ogni riga di progresso, risalire al capitolo, poi alla sua serie, e tenere la data più recente:

```js
export async function getSeriesLastReadMap() {
  const progressRows = await db.readingProgress.toArray();
  const chapters = await db.chapters.bulkGet(progressRows.map((progress) => progress.chapterId));

  const map = {};
  progressRows.forEach((progress, index) => {
    const chapter = chapters[index];
    if (!chapter || chapter.seriesId == null) return;
    if (!map[chapter.seriesId] || progress.lastReadAt > map[chapter.seriesId]) {
      map[chapter.seriesId] = progress.lastReadAt;
    }
  });
  return map;
}
```

`db.chapters.bulkGet(idArray)` recupera più righe in un colpo solo dato un array di id (già visto in Fase 12 per `getReadingProgressMap`) — più efficiente di tante letture singole in un ciclo. Il risultato è una mappa `{seriesId: dataPiùRecente}`: le serie mai lette semplicemente **non compaiono**, e nell'ordinamento vengono trattate come "meno recenti di tutte" grazie a `?? 0` (nessuna voce in mappa → 0, sempre più piccolo di una data vera).

---

## ✅ Come verificare che funzioni

Testato con dati nel database (serie con e senza cronologia di lettura, a orari diversi):

- **`getSeriesLastReadMap`**: una serie mai letta non compare nella mappa; tra due serie lette, quella più recente ha effettivamente un valore maggiore.
- **Ordinamento "ultimi letti"**: nel catalogo, le serie compaiono nell'ordine corretto (più recente prima), quella mai letta in fondo.
- **Ricerca a tutti i livelli**: filtra correttamente titoli di serie, "Volume N" e "Capitolo N"; mostra "Nessun risultato per «query»" quando non c'è nulla che corrisponda.
- **Reset della ricerca**: navigando dentro una serie o un volume, il campo si svuota automaticamente; il selettore di ordinamento resta visibile solo al livello Serie (non ha senso altrove) e la preferenza di ordinamento sopravvive tornando a quel livello.
- Nessun errore in console.

---

## 🔜 Prossimi passi

Con questa fase la libreria è completa in tutte le sue funzioni principali (import, categorizzazione, navigazione, rimozione, progresso, preferiti, ricerca). Le prossime fasi della roadmap si spostano su aspetti trasversali dell'app: gestione degli errori più robusta, temi, lingua, e infine il deploy pubblico.
