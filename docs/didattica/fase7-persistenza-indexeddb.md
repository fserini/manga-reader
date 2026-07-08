# Fase 7 — Persistenza dati: setup IndexedDB

> Documentazione didattica, scritta per chi non ha mai visto React (né database nel browser) prima. Questa fase non tocca l'interfaccia: è la prima puramente "motore dati", pensata per essere capita e verificata prima di costruirci sopra la vera libreria (Fasi 8-13).

---

## 🎯 Obiettivo della fase

Finora l'app non "ricordava" nulla: ogni file scelto nel Lettore viveva solo in memoria, perso alla ricarica della pagina. Questa fase introduce **IndexedDB**, il database che i browser mettono a disposizione per salvare dati in modo permanente sul dispositivo — base per tutto ciò che serve dopo: libreria, progressi di lettura, preferiti.

Volutamente **nessuna interfaccia** in questa fase: solo lo schema dei dati e le funzioni per leggerli/scriverli, verificate direttamente (senza passare da pulsanti o schermate) prima di costruirci sopra le fasi successive.

---

## 🧩 Cos'è IndexedDB (e perché non basta `localStorage`)

Il browser offre diversi modi per salvare dati sul dispositivo dell'utente. Il più noto è `localStorage`, ma ha limiti seri per un'app come questa: salva solo semplici coppie chiave-testo, ha un limite di spazio molto basso (pochi MB) e blocca il resto del codice mentre legge/scrive (operazioni sincrone).

**IndexedDB** è pensato per casi più seri: può salvare grandi quantità di dati strutturati (in teoria centinaia di MB o più, a seconda del dispositivo), organizzati in "tabelle" con indici per cercare velocemente, e tutte le operazioni sono **asincrone** (non bloccano l'interfaccia mentre l'app legge o scrive). Il prezzo da pagare è che l'API nativa di IndexedDB è particolarmente scomoda da usare — richiede parecchio codice per operazioni semplici, con un modello a eventi piuttosto verboso.

### Dexie.js: un'interfaccia più comoda sopra IndexedDB

**Dexie** non sostituisce IndexedDB: lo usa dietro le quinte, ma espone un'API basata su `Promise`/`async`/`await`, molto più simile a come si lavora già nel resto del progetto (es. `entry.async('blob')` di JSZip in Fase 3). Confronto concettuale — con IndexedDB nativo, anche solo leggere una riga richiede gestire eventi `onsuccess`/`onerror`; con Dexie:

```js
const chapter = await db.chapters.get(1);
```

---

## 🗂️ Lo schema: tabelle e indici

```js
db.version(1).stores({
  series: '++id',
  volumes: '++id, seriesId',
  chapters: '++id, seriesId, volumeId, importedAt',
  readingProgress: 'chapterId, lastReadAt',
});
```

Ogni riga descrive una tabella. Il primo campo è la **chiave primaria** (l'identificatore univoco di ogni riga): `++id` significa "numero intero, assegnato automaticamente in ordine crescente" (come un `AUTOINCREMENT` di SQL). Per `readingProgress`, la chiave primaria è `chapterId` **senza** `++`: non viene generata automaticamente, perché coincide con l'id del capitolo a cui si riferisce (una relazione 1-a-1: ogni capitolo ha al più una riga di progresso).

I campi elencati dopo la chiave primaria sono gli **indici**: non tutti i dati salvati devono comparire qui, solo i campi su cui servirà poi filtrare o ordinare velocemente. Ad esempio `chapters` salva anche `fileName` e `number`, ma non sono indicizzati perché (per ora) non servono per cercare — indicizzare tutto "per sicurezza" avrebbe solo un costo (spazio, velocità di scrittura) senza benefici.

### La struttura: Serie → Volumi → Capitoli, con una zona intermedia

Rispecchia la gerarchia decisa nell'analisi funzionale, con un dettaglio pratico: un capitolo appena importato può non avere ancora una serie/volume assegnati (`seriesId`/`volumeId` a `null`) — è la sezione "Da categorizzare" che verrà costruita in Fase 8/9. Tenerlo nella stessa tabella `chapters` (invece che in una tabella separata "file grezzi") evita di dover spostare/duplicare dati quando l'utente lo categorizza: si aggiornano semplicemente `seriesId`/`volumeId` sulla riga già esistente.

### Un vincolo di IndexedDB che ha cambiato lo schema: niente booleani come indice

Il primo tentativo di schema includeva un campo `categorized` (booleano) tra gli indici, per poter interrogare velocemente "dammi i capitoli non ancora categorizzati". Si è rivelato un errore: **IndexedDB accetta solo alcuni tipi come chiave/indice** — numeri, stringhe, `Date` e array — **non i booleani**. Stessa cosa per `favorite` sulle serie.

Soluzione adottata: quei campi restano salvati normalmente nella riga (si possono leggere e scrivere senza problemi), semplicemente non compaiono nell'elenco degli indici. Per interrogarli si legge l'insieme di righe con `.toArray()` e si filtra con il normale `.filter()` di JavaScript:

```js
export async function getUncategorizedChapters() {
  return db.chapters.filter((chapter) => !chapter.categorized).toArray();
}
```

Con poche decine o centinaia di capitoli (il caso reale di una libreria manga personale) questo è del tutto sufficiente — l'indicizzazione vera e propria conviene solo con volumi di dati molto più grandi.

---

## 🛠️ Le funzioni del "motore dati"

Il file [`src/db.js`](../../src/db.js) espone un piccolo insieme di funzioni `async`, ciascuna con una responsabilità precisa — non un'unica funzione generica "salva/leggi qualsiasi cosa", ma funzioni con nomi che spiegano l'intenzione (`addSeries`, `categorizeChapter`, `getInProgress`, ...). Il resto dell'app (a partire dalla Fase 8) userà solo queste funzioni, senza dover conoscere i dettagli dello schema Dexie sottostante.

Un esempio che vale la pena isolare, `getInProgress`:

```js
export async function getInProgress(limit = 10) {
  const recent = await db.readingProgress.orderBy('lastReadAt').reverse().toArray();
  return recent.filter((progress) => progress.lastPageRead < progress.totalPages - 1).slice(0, limit);
}
```

`orderBy('lastReadAt')` usa l'indice per ordinare i risultati direttamente nel database (più efficiente che leggere tutto e ordinare in JavaScript); `.reverse()` inverte l'ordine (dal più recente); il filtro "esclude i completati" avviene invece in JavaScript dopo la lettura, per lo stesso motivo di `categorized` sopra — "completato" è un concetto derivato (pagina corrente vicina al totale), non un valore salvato a parte.

---

## ✅ Come verificare che funzioni

Senza interfaccia, il test è avvenuto direttamente nel browser, importando il modulo a runtime (Vite serve i moduli ES del progetto anche ad un import dinamico digitato a mano):

```js
const { addSeries, addChapter, ... } = await import('/src/db.js');
```

Verificato in questa fase:

- Creazione di una serie, un volume, un capitolo categorizzato e uno non categorizzato
- `getUncategorizedChapters()` trova correttamente solo il capitolo senza serie/volume assegnati
- Dopo `categorizeChapter(...)`, lo stesso capitolo sparisce dall'elenco "da categorizzare"
- `toggleFavorite(...)` aggiorna correttamente il campo sulla serie
- `updateReadingProgress(...)` su due capitoli in momenti diversi, poi `getRecentlyRead()` restituisce l'ordine corretto (più recente prima)
- `getInProgress()` esclude correttamente un capitolo quasi completato (pagina 19 di 20) e include quello a metà (pagina 5 di 20)
- `setManualBookmark(...)` salva il segnalibro manuale separatamente dal tracking automatico
- **Persistenza reale**: dopo un reload completo della pagina, tutti i dati risultano ancora presenti — non era solo stato in memoria, ma davvero salvato nel database del browser

---

## 🔜 Prossimi passi

Lo "storage" dei file veri e propri (come accedere ai CBZ/CBR sul tablet in modo persistente, non solo tramite file picker una tantum) resta un punto tecnico aperto, esplicitamente rimandato in `02-analisi-tecnica.md` a uno step dedicato prima di costruire l'import. La Fase 8 lo affronterà insieme all'import multiplo e alla sezione "Da categorizzare", collegando finalmente questo motore dati a un'interfaccia reale.
