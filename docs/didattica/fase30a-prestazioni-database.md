# Fase 30a — Prestazioni: il database che regge le librerie grandi

> Prima metà della Fase 30. Nasce da una domanda concreta: *"cosa succede se carico molti manga con molti capitoli?"*. Invece di rispondere a sensazione abbiamo **misurato** (dati sintetici, 1.500 e 9.000 capitoli) e poi sistemato le cause, una per una. La 30b si occuperà del backup.

---

## 1. Prima di ottimizzare: misurare

Regola numero uno delle prestazioni: **non si ottimizza ciò che non si è misurato**. Abbiamo popolato il database con 9.000 capitoli (150 serie, 900 volumi, miniature vere) e cronometrato le operazioni reali dell'app. Il risultato ha smentito qualche intuizione: lo spazio occupato non era il problema (i file non vengono copiati, sono solo riferimenti e miniature), e la lettura di un capitolo non dipende da quanti capitoli ci sono in libreria. Rallentavano le operazioni che **attraversano tutta la tabella**.

## 2. La causa: scansioni complete di righe pesanti

Ogni riga di `chapters` portava con sé la miniatura (~15 KB, un `Blob`). Domande banali come *"quali capitoli sono da categorizzare?"* erano scritte così:

```js
db.chapters.filter((c) => !c.categorized).toArray()
```

`filter` non può usare un indice: IndexedDB legge **tutte** le righe, miniature comprese, e le scarta una a una. A 9.000 capitoli sono circa 130 MB letti per trovare 40 righe.

Due interventi, uno per problema:

### 2a. Gli indici vogliono numeri, non booleani

IndexedDB **non può usare `true`/`false` come chiave di un indice**. Per poter scrivere `where('categorized').equals(0)` i due flag `categorized` e `favorite` ora si salvano come **0/1**. Il resto dell'app continua a ragionare in booleani dove serve (`Boolean(chapter.favorite)`).

### 2b. Le miniature in una tabella a parte

Le miniature dei capitoli vivono ora in `thumbnails` (`{ chapterId, blob }`). Le righe di `chapters` tornano leggere e le scansioni diventano economiche. Chi ha bisogno della copertina la chiede esplicitamente: `withThumbnails()` fa un solo `bulkGet` per un elenco di capitoli e rimette il campo `thumbnail` com'era prima, così **le pagine non cambiano**.

Per la stessa ragione, `removeChapter/Volume/Series` ora cancellano anche le righe di `thumbnails` (altrimenti resterebbero orfane per sempre), e `setChapterThumbnail` scrive nella tabella nuova.

## 3. Migrazione dello schema (Dexie v3)

Cambiare le chiavi o spostare dati richiede una nuova **versione** dello schema:

```js
db.version(3).stores({ /* nuove tabelle e indici */ }).upgrade(async (tx) => { /* sposta i dati */ });
```

Dexie esegue `upgrade` una sola volta, sul dispositivo dell'utente, la prima volta che apre il database con la versione nuova. È il punto più delicato della fase: **se sbaglia, sbaglia sui dati veri**. Per questo:

- lavora **a blocchi di 500 capitoli** (`MIGRATION_CHUNK`), senza caricare tutte le miniature in memoria insieme;
- per ogni blocco scrive prima le miniature nella tabella nuova e poi le righe ripulite: se qualcosa si interrompesse, la transazione viene annullata per intero (Dexie lavora in un'unica transazione di aggiornamento) e il database resta alla v2;
- calcola anche `series.lastReadAt` (punto 4).

Testata su un database v2 **reale** da 9.040 capitoli, 5.424 righe di progresso, 450 preferiti e 40 da categorizzare: dopo l'apertura il database è alla v3, con gli stessi conteggi, 9.000 miniature spostate, 450 preferiti e 40 "da categorizzare" ritrovati tramite gli indici.

## 4. L'ultima lettura sta sulla serie

L'ordinamento "Ultimi letti" del Catalogo costruiva a ogni apertura una mappa *serie → ultima lettura* leggendo **tutti** i progressi e **tutti** i capitoli collegati (~0,3 s a 9.000). Ora ogni serie porta il proprio `lastReadAt`:

- `updateReadingProgress` lo aggiorna quando si legge, ma **al massimo una volta al minuto** (`SERIES_LAST_READ_THROTTLE_MS`): il progresso si salva a ogni cambio pagina, e riscrivere la serie a ogni pagina sarebbe lavoro inutile per un dato che serve solo a ordinare;
- la migrazione lo ricava dai progressi esistenti;
- il ripristino di un backup lo ricalcola (i backup vecchi non lo contengono).

`getSeriesLastReadMap` è sparita; il Catalogo ordina con `item.lastReadAt ?? 0`.

## 5. "In corso di lettura": fermarsi quando basta

Prima si leggevano tutti i progressi e i capitoli collegati, per tenerne dieci. Ora `getInProgressChapters` scorre i progressi dal più recente **a blocchi di 40** (`IN_PROGRESS_BATCH`) e **si ferma appena ne ha trovati dieci**. Il filtro "non completato" sta nella query; quello "non segnato come letto" richiede il capitolo, quindi si applica blocco per blocco. Un dettaglio che morde: in Dexie `filter()` si applica **prima** di `offset()` e `limit()`, quindi la paginazione a blocchi dà il risultato giusto.

## 6. La card "Da categorizzare" conta, non carica

La Libreria usava `getUncategorizedChapters()` solo per scrivere "N capitoli da categorizzare". Ora usa `getUncategorizedCount()` (`where(...).count()`), che con un indice non legge nemmeno le righe. La lista vera la carica soltanto la pagina `/uncategorized`.

## 7. Il backup non cambia formato

`exportBackup` rimette le miniature dentro ogni capitolo come prima (ora `version: 2`, ma stessa struttura), e `restoreBackup` accetta **sia i backup nuovi sia quelli vecchi**: normalizza i flag a 0/1, separa le miniature e ricalcola `lastReadAt`. Un backup fatto prima di questa fase si ripristina senza accorgersi di nulla. Verificato con un backup v1 costruito a mano (booleani, miniatura nel capitolo): preferiti, "da categorizzare", copertine e ultima lettura corretti; export e re-import ricostruiscono lo stesso stato.

## 8. Risultati

Stesso metodo, stesso database da 9.000 capitoli (desktop, dati sintetici):

| Operazione | Prima | Dopo |
|---|---|---|
| Card "da categorizzare" | ~1.000 ms | < 1 ms (conteggio) |
| Elenco "da categorizzare" | ~1.000 ms | 3 ms |
| Preferiti: capitoli | ~1.100 ms | 134 ms |
| Ricerca globale: caricamento | ~1.100 ms | 494 ms |
| "In corso di lettura" | 440 ms | 35 ms |
| Mappa ultima lettura per serie | 290 ms | eliminata |
| Tornare in Libreria fino al Catalogo disegnato | 2.000–3.400 ms | ~290 ms |

Va detto con onestà cosa **non** abbiamo misurato: i tempi sono di un desktop, non di un tablet (dove ci aspettiamo 3–6× di più, ma resta una stima), e la ricerca globale carica ancora tutti i capitoli categorizzati quando si scrive la prima lettera (0,5 s a 9.000: accettabile, migliorabile). Resta anche aperto il backup: a 9.000 capitoli è ancora un unico JSON da ~200 MB. Se ne occupa la **30b**.

## 9. Cosa si è imparato

- **Misurare prima, e dopo.** Senza i numeri avremmo ottimizzato lo spazio, che non era il problema.
- **`filter()` non è `where()`.** Il primo scansiona, il secondo usa un indice. La differenza non si vede con 50 righe, e con 9.000 sì.
- **Separare i dati pesanti da quelli che si interrogano** (miniature vs. righe dei capitoli) rende economiche tutte le scansioni.
- **Una migrazione è codice che gira una volta sola sui dati dell'utente**: si fa a blocchi, si prova su dati reali e si lascia il vecchio formato leggibile (qui, i backup).
- **Un dato derivato memorizzato** (`lastReadAt` sulla serie) sostituisce un calcolo ripetuto, ma va mantenuto: per questo l'aggiornamento è a ogni lettura (limitato nel tempo), nella migrazione e nel ripristino.
