# Fase 15 — Gestione errori

> Documentazione didattica, scritta per chi non ha mai visto React prima. Fase di "irrobustimento": non aggiunge funzionalità visibili in condizioni normali, le aggiunge per le condizioni **anormali** — file rovinati, immagini illeggibili. E racconta una scoperta interessante fatta durante il collaudo, su un ambiente di test piuttosto che sull'app.

---

## 🎯 Obiettivo della fase

Due lacune concrete, individuate rileggendo il codice esistente con l'occhio rivolto a "cosa succede se le cose vanno storte":

1. **In fase di import**, l'app si fidava ciecamente dell'estensione del file (`.cbz`/`.cbr`): un file rinominato o danneggiato veniva importato senza controlli, e l'utente lo scopriva solo aprendolo nel Lettore, molto più tardi.
2. **In fase di lettura**, se anche una sola immagine dentro un archivio altrimenti valido era danneggiata, l'intera estrazione falliva: un capitolo di 30 pagine con una sola pagina rovinata diventava illeggibile per intero.

---

## 🔍 Validare un archivio senza aprirlo del tutto

Per intercettare i file corrotti già in fase di import, serve un modo per chiedere "questo file è un archivio leggibile, con almeno un'immagine dentro?" senza pagare il costo di **estrarre tutte le pagine** — specie importando una cartella intera con decine di file.

```js
export async function isValidArchive(file) {
  try {
    if (isCbrFileName(file.name)) {
      const archive = await Archive.open(file);
      const filesArray = await archive.getFilesArray(); // solo elenco, nessuna estrazione
      return filesArray.some(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name));
    }
    const zip = await JSZip.loadAsync(file);
    return Object.values(zip.files).some((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name));
  } catch {
    return false;
  }
}
```

Per i CBR, `archive.getFilesArray()` **senza** aver prima chiamato `extractFiles()` restituisce solo l'elenco delle voci (già notato in Fase 3/4): legge la struttura dell'archivio, non ne decomprime il contenuto. Per i CBZ, `JSZip.loadAsync` legge l'indice centrale dello zip, altrettanto leggero. Se il file non è nemmeno un archivio valido (bytes casuali con estensione `.cbz`), l'apertura stessa lancia un errore, catturato dal `try/catch` che restituisce `false`.

### Un limite voluto: non decodifica le immagini

Questa validazione controlla che esista *un'voce con nome-immagine*, non che quella immagine sia *davvero* decodificabile — richiederebbe di decomprimerla e passarla a `createImageBitmap`, lo stesso costo che si voleva evitare. È una scelta consapevole: **due controlli a livelli diversi**, ciascuno con lo scopo giusto — validazione strutturale leggera all'import (questa sezione), resilienza per-pagina in lettura (la prossima), quando il costo di decodificare è comunque necessario per mostrare la pagina.

---

## 🩹 Una pagina rotta non deve far cadere tutto il capitolo

Il vecchio codice usava `Promise.all` su tutte le pagine dell'archivio: **una singola** promessa respinta (una pagina che non si riesce a estrarre o decodificare) fa fallire l'intero `Promise.all`, buttando via anche le pagine perfettamente leggibili insieme a quella danneggiata. La correzione: intercettare l'errore **per singola pagina**, non per l'intero capitolo.

```js
async function extractEntrySafely(entry) {
  try {
    return await entry.async('blob');
  } catch {
    return null;  // "pagina illeggibile", non un errore fatale
  }
}
```

E lo stesso principio si ripete un livello più sopra, attorno al taglio delle doppie pagine (Fase 5), che può fallire se l'immagine non si riesce a decodificare:

```js
return Promise.all(
  rawImages.map(async (blob) => {
    if (!blob) return [null];
    try {
      return await splitSpreadIfNeeded(blob);
    } catch {
      return [null];
    }
  }),
);
```

`null` diventa il segnale condiviso "questa pagina non c'è/non si legge" — un valore che il resto della catena (Lettore compreso) sa riconoscere e gestire, invece di un'eccezione che si propaga fino a far fallire tutto.

### Il segnaposto: un componente che sceglie cosa mostrare

Il Lettore rendeva ogni pagina con un semplice `<img src={pageUrl} />`. Ora un piccolo componente decide cosa disegnare in base al valore:

```jsx
function Page({ url, alt, style }) {
  if (!url) {
    return (
      <div className="reader-page-broken">
        <span aria-hidden="true">⚠️</span>
        <span>{alt}: immagine danneggiata</span>
      </div>
    );
  }
  return <img src={url} alt={alt} style={style} />;
}
```

Usato ovunque prima c'era un `<img>` diretto — scroll continuo, pagina singola, doppia pagina — così tutte e tre le modalità mostrano lo stesso segnaposto coerente, senza ripetere la logica in ognuna.

### Un dettaglio facile da sbagliare: `null` non è `undefined`

Il conteggio "pagina 2 di uno spread" usava un controllo un po' impreciso:

```js
{secondPageOfSpread && <img src={secondPageOfSpread} ... />}
```

`secondPageOfSpread` può valere tre cose diverse: una stringa (URL valido), `undefined` (non esiste una pagina successiva — si è arrivati alla fine) oppure, da questa fase, `null` (la pagina esiste ma è danneggiata). Il controllo `&&` tratta `null` e `undefined` allo stesso modo (entrambi "falsy"), nascondendo per errore anche le pagine rotte invece di mostrare il segnaposto. La correzione distingue esplicitamente i due casi:

```js
{secondPageOfSpread !== undefined && <Page url={secondPageOfSpread} ... />}
```

Ora `null` (pagina rotta, da mostrare come segnaposto) supera il controllo, mentre solo `undefined` (pagina che non esiste) lo blocca davvero. Un promemoria utile: quando un valore può essere "assente" in più di un modo, un controllo booleano generico (`if (valore)`) spesso confonde i casi — meglio essere espliciti su quale "assenza" si sta davvero escludendo.

---

## 🕵️ Una scoperta di percorso: un bug del browser di test, non dell'app

Testando la resilienza con una paginetta sintetica (la stessa immagine 1×1 pixel usata come dato di prova fin dalla Fase 3), è comparso un errore inatteso: **anche** la pagina "buona" falliva la decodifica, non solo quella corrotta apposta. Indagando a fondo (confrontando i byte prima e dopo il passaggio nell'archivio, provando `createImageBitmap` sui byte originali, provando anche un normale tag `<img>`), è emerso che quella specifica immagine minuscola non veniva decodificata da `createImageBitmap` in questo ambiente di test (un Chromium integrato in Electron), mentre il tag `<img>` nativo la gestiva senza problemi.

Non è un problema del codice dell'app — è la prova che la pagina 1×1 di prova, finora comoda per i test rapidi, è troppo "degenere" per alcuni percorsi di decodifica. La verifica è stata rifatta con una pagina reale estratta da un capitolo vero (nessuna manga scan è mai larga 1 pixel), e il meccanismo ha funzionato esattamente come previsto. La lezione pratica: quando un test fallisce in un modo inatteso, **prima di correggere il codice conviene isolare dove sta davvero il problema** — a volte è nel dato di prova, non in ciò che si sta collaudando.

---

## ✅ Come verificare che funzioni

Verificato con archivi costruiti ad hoc:

- **`isValidArchive`**: `true` per un archivio con almeno un'immagine (anche se quell'immagine non è poi decodificabile — la validazione è solo strutturale, di proposito); `false` per un archivio senza immagini, e `false` per un file che non è affatto uno zip valido.
- **Resilienza per-pagina**: sia un CBZ sia un CBR (con una pagina reale e una pagina "immagine" con dati casuali) producono due gruppi distinti — quello buono con il/i Blob attesi, quello rotto come `[null]` — senza che l'estrazione fallisca nel suo complesso. Per il CBR è stata anche una verifica utile su `extractFiles()` di libarchive.js: non fa fallire l'intero archivio se una voce contiene dati che non sono davvero un'immagine — il fallimento emerge solo dopo, al momento di decodificarla (`createImageBitmap`), esattamente dove il codice già lo intercetta.
- **Nel Lettore**: la pagina rotta mostra il segnaposto "⚠️ immagine danneggiata" in tutte e tre le modalità (singola, doppia, scroll); il contatore pagine riconosce correttamente una pagina rotta come "seconda" di uno spread (es. "2-3 / 3"), grazie alla distinzione `null`/`undefined`.
- Nessun errore in console durante nessuno di questi scenari.

**Non testabile in questo ambiente:** l'innesco del vero selettore file nativo con un file realmente corrotto scelto dall'utente (richiede un gesto utente genuino, come per ogni funzionalità di import di questo progetto) — la logica sottostante (`isValidArchive`) è comunque verificata a fondo in isolamento, e il collegamento nella Libreria ricalca esattamente lo schema già collaudato del rilevamento duplicati.

---

## 🔜 Prossimi passi

La **Fase 16** aggiunge backup e ripristino dei dati (esportazione/importazione di libreria, progressi e preferiti) — l'ultima delle funzionalità "dati" previste dall'analisi funzionale, prima delle fasi trasversali di rifinitura (temi, lingua) e del deploy pubblico.
