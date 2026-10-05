# Fase 23 — Categorizzazione assistita e multipla

> **Aggiornamento (Fase 33):** la pre-compilazione dal nome del file descritta nei punti 1 e 2 è stata **tolta** su richiesta di Federico (i campi tornano vuoti, con l'esempio scritto) e il parser `chapterNameParser.js` è stato cancellato; restano la selezione multipla, il form multiplo e il salvataggio in blocco. Vedi [fase33](fase33-correzioni-semplificazioni.md).
>
> Nata dal feedback su un import di ~20 capitoli insieme, categorizzabili solo uno alla volta, ognuno con tre campi da compilare a mano. Si appoggia alla coda dedicata `/uncategorized` della [Fase 22](fase22-coda-categorizzazione-copertine.md). Due idee: **farsi aiutare dal nome del file** (il lavoro che si fa a mano spesso è già scritto lì) e **lavorare su più capitoli insieme**.

---

## 1. Leggere il nome del file: `chapterNameParser.js`

I file scaricati hanno quasi sempre nomi come `One Piece v01 c001.cbz` o `[Team] One Piece - c012 (v03).cbr`. Il modulo ricava, quando può, tre cose: **serie**, **volume**, **capitolo**. Sono funzioni pure (niente React, niente database): si possono provare a parte, e così abbiamo fatto, con una ventina di nomi di esempio.

Gli strumenti sono **espressioni regolari**:

- **Volume**: `v01`, `vol.3`, `Volume 12`, `tome 4`, `tomo 2`.
- **Capitolo**: `c012`, `ch.12`, `chapter 7`, `chapitre 20`, `cap 3`, `capitolo 12.5`. I decimali (`12.5`) sono capitoli speciali tra due numerati.
- **Ultima risorsa**: un numero in fondo al nome (`Berserk 042`), usato solo se non c'è nessuna sigla e resta una serie davanti. Un nome fatto solo di un numero (`001.cbz`) è un capitolo senza serie.
- **Serie**: il testo che precede la prima sigla, senza i gruppi tra parentesi (`[Team]`, `(Digital)`), con `_` letti come spazi e separatori ai bordi tolti.

Due dettagli che evitano falsi positivi:

- `(?<![\p{L}])` (*lookbehind*: "non preceduto da una lettera") impedisce di leggere la `c` di `Chainsaw` o la `v` di `Dr. Stone` come sigle; `(?!\d)` impedisce di fermarsi a metà di un numero più lungo.
- Le sigle possono stare tra parentesi (`One Piece (v03)`): per **cercarle** le parentesi diventano spazi, per ricavare la **serie** invece si tolgono insieme al loro contenuto.

Il parser è **prudente**: preferisce non rispondere che rispondere a caso. Limite noto: un nome senza sigle né numeri, come `scan_final.cbz`, viene letto comunque come una serie ("scan final"), perché `Naruto.cbz` è un caso altrettanto reale. Per questo il suggerimento è sempre e solo un suggerimento (punto 3).

### Somiglianza con le serie esistenti

`findSimilarSeries` confronta il testo con le serie già in libreria dopo averli resi "confrontabili" (`normalizeTitle`: senza maiuscole, accenti e punteggiatura, quindi `One-Piece`, `one piece` e `ONE PIECE!` coincidono). Vale se i due titoli sono **uguali** oppure uno è **contenuto** nell'altro, ma solo con almeno 4 caratteri: sotto, una serie chiamata "One" si troverebbe in mezza libreria. Tra più candidate vince quella di lunghezza più vicina.

## 2. Il dialog singolo si pre-compila

All'apertura, `CategorizeForm` carica le serie e applica il suggerimento:

- se il nome somiglia a una serie esistente, la **seleziona**, e se il nome indica un volume la seleziona tra i suoi volumi (o propone di crearlo, se non c'è);
- altrimenti, se il nome contiene una serie, imposta **"Nuova serie…"** con quel nome;
- il numero di capitolo, se c'è.

Una riga azzurra avvisa "Campi compilati dal nome del file: controlla e correggi se serve", perché chi guarda un form deve poter distinguere un **dato** da un **suggerimento**. Tutto resta modificabile. Il volume della serie esistente arriva dopo (i volumi si caricano quando la serie è selezionata), quindi il numero suggerito viene tenuto in un `ref` e applicato appena l'elenco è pronto.

## 3. Selezione multipla nella coda

In `Uncategorized.jsx`:

- una **casella per riga** e "Seleziona tutti" (con lo stato *indeterminato* se è selezionata solo una parte: `input.indeterminate` esiste solo come proprietà, non come attributo, quindi si imposta con un `ref`);
- l'intera riga di selezione (casella, icona e nome) è **un'unica `<label>`**, così su touch tutto il nome è una zona di tocco;
- una **barra azioni** fissa in basso (`position: sticky`) compare quando c'è almeno un capitolo selezionato: "N selezionati", "Deseleziona", "Categorizza…";
- la lista è ora in ordine di nome file **naturale** (`localeCompare` con `numeric: true`: "cap 2" prima di "cap 10"), che con molti file importati insieme è l'ordine in cui si vogliono categorizzare;
- dopo ogni modifica, la selezione scarta i capitoli che non esistono più.

## 4. Il form multiplo: `BulkCategorizeForm`

- **Una serie per tutti** (esistente o nuova), pre-compilata: la più frequente tra quelle a cui i nomi somigliano, altrimenti il nome più frequente come serie nuova (`mostCommon`).
- **Interruttore "Stesso volume per tutti i capitoli selezionati"**, attivo di default. Attivo: un solo campo Volume e poi, riga per riga, solo il numero di capitolo (pre-compilato dal nome). Disattivo: ogni riga ha anche il suo volume — copre i gruppi di file che mischiano più volumi. Riattivando i volumi per riga, quelle senza volume ereditano il valore condiviso: si parte da un dato sensato, non da campi vuoti.
- **Il volume si indica per numero**, non scegliendolo da un elenco: se la serie ha già quel volume lo si usa, altrimenti si crea. Un solo campo vale per tutti i casi, e un promemoria elenca i volumi già presenti ("Volumi già presenti in questa serie: 1, 2"). Il form singolo, invece, mantiene il suo menu di volumi esistenti.
- Una riga con un numero mancante o non valido blocca il salvataggio e **dice quale file**.

### Il salvataggio è atomico

`categorizeChaptersBatch` (in `db.js`) fa tutto dentro **un'unica transazione**: crea la serie se serve, crea ogni volume mancante **una volta sola** (anche se cinque capitoli lo condividono), assegna i capitoli. Se qualcosa fallisce non resta una serie vuota, né metà dei capitoli categorizzati. È lo stesso principio del ripristino del backup: o tutto o niente.

## 5. Verifica

In sandbox, con capitoli importati come righe di database (i dialog sono quelli veri):

- **Pre-compilazione singola**: `One Piece v01 c001` seleziona "One Piece", "Volume 1" e capitolo 1; `Berserk 042` propone una serie nuova "Berserk" con capitolo 42; `Vagabond v02 c020` serie nuova, volume 2, capitolo 20; un nome senza sigle propone solo la serie.
- **Multipla, serie esistente**: 6 file `[Team] One Piece - c020…c025 (v03)` → "One Piece" selezionata, volume condiviso 3, numeri 20–25. Salvataggio: **un solo volume 3 creato** (non cinque), tutti categorizzati, coda da 11 a 5.
- **Validazione**: numero di capitolo e volume per riga mancanti bloccano e nominano il file.
- **Volumi per riga**: disattivato l'interruttore, ogni riga mostra il suo volume; una riga portata a 4 crea il volume 4.
- **Serie nuova per più file** (due `Vagabond`): serie creata una volta, volumi 1 e 2 con i loro capitoli.
- "Seleziona tutti", "Annulla" (non cambia nulla nel database) e lo stato indeterminato.
- Il form multiplo letto a **375 px di larghezza**: righe che vanno a capo, campi leggibili.
- Lint e build passano.

Cosa **non** è stato verificato: il tablet (solo desktop e una finestra emulata a 375 px), e l'uso con file veri invece di righe di database create a mano (l'import non è stato toccato).

## 6. Cosa si è imparato

- **Le espressioni regolari vanno provate su esempi, non scritte a fiducia**: nomi come `Dr. Stone` o `Chainsaw Man` rompono le regole ingenue.
- **Un suggerimento non è un dato**: pre-compilare è utile solo se l'utente vede che è pre-compilato e può correggerlo.
- **Una sola operazione di scrittura per un'azione dell'utente**: la transazione evita gli stati a metà.
- **Lasciare a chi sceglie il livello di dettaglio**: un interruttore ("stesso volume per tutti") mantiene semplice il caso comune senza impedire quello complicato.
