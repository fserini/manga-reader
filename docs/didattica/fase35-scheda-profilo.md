# Fase 35 — La scheda Profilo

> La terza scheda smette di essere una pagina lunga di impostazioni e diventa il **Profilo**: in alto una chiave inglese che apre le impostazioni (ognuna in una sua pagina), e nella pagina le card. Per ora c'è solo la card **Statistiche**; la lista "Le mie serie" arriva con la Fase 34, che dipende da questo guscio.

---

## 1. Perché cambia la struttura

La vecchia pagina Impostazioni conteneva tutto: Aspetto (marchio, menu, pagina iniziale, schermo intero), Lingua, Statistiche, Backup. Con il tempo era diventata una colonna lunga in cui le impostazioni (che si toccano di rado) occupavano il posto di ciò che interessa di più (le statistiche, e presto la lista delle serie). Il Profilo ribalta le priorità: **la pagina mostra ciò che riguarda l'utente; le impostazioni stanno dietro un'icona**.

## 2. Indirizzi veri

Ogni pagina nuova ha un indirizzo, così il tasto indietro di Android funziona e un collegamento si può salvare:

- `/profilo` — il Profilo;
- `/profilo/aspetto`, `/profilo/lingua`, `/profilo/backup` — le tre pagine delle impostazioni;
- `/settings` — il vecchio indirizzo, che ora **reindirizza** al Profilo (`<Navigate replace>`): un segnalibro o un collegamento salvato non si rompe;
- un indirizzo di sezione sconosciuto (`/profilo/inesistente`) torna al Profilo.

Le tre sezioni sono descritte in un elenco (`profileSections.js`: identificatore, icona, chiave del testo) usato sia dal menu sia dalla pagina: aggiungere una voce è aggiungere una riga. Sta in un file a parte perché ESLint (react-refresh) non vuole costanti esportate accanto a un componente.

## 3. Il codice che c'era si divide, non si riscrive

`Settings.jsx` (400 righe) è diventato `SettingsSection.jsx`: **lo stesso codice**, con in più un parametro, la sezione da mostrare, ricavato dall'indirizzo (`useParams`). Ogni blocco è racchiuso in `{section === 'aspetto' && (...)}`, e due pezzi sono stati tolti: le statistiche (ora sono la card del Profilo) e i titoli `h2` di sezione (adesso il titolo è l'`h1` della pagina). Un effetto che prima girava sempre, la stima del peso del backup (che somma le dimensioni delle miniature), ora gira **solo** aprendo la pagina del backup.

Dividere invece di riscrivere ha un vantaggio concreto: tutto il comportamento delle impostazioni (preferenze, backup, ripristino, conferme) è identico a prima, e i controlli già verificati restano verificati.

## 4. La card Statistiche

`StatsCard` non è cliccabile. Mostra **serie, volumi, capitoli** (conteggi della libreria) e **pagine lette**. Spariscono: il tempo stimato (il database non lo misura), i capitoli finiti e le serie più lette. In alto a destra un'icona apre la finestra di conferma del reset (si riusa `ConfirmDialog`).

### Il reset azzera il contatore, non il progresso

Le pagine lette **non sono un contatore salvato**: si calcolano ogni volta dal progresso di lettura (a che pagina si è arrivati in ogni capitolo). Azzerarle cancellando il progresso farebbe sparire anche "Continua a leggere" e "In corso". Quindi il reset non tocca il progresso: salva un **punto di partenza** (le pagine lette in quel momento) e la card mostra **la differenza** tra il valore attuale e quel punto.

C'è una trappola: se poi il progresso **scende** sotto il punto di partenza (per esempio si toglie un capitolo da "In corso"), la differenza resterebbe a zero finché non si rileggesse tutto ciò che si è tolto. Per questo, quando il valore attuale è sotto il punto di partenza, **il punto di partenza scende con lui**. Provato: punto di partenza 35, progresso azzerato, poi 10 pagine di nuova lettura → la card dice 10.

## 5. Una tabella nuova: `meta`

Il punto di partenza è un dato dell'app che non è né una serie né un capitolo. Si aggiunge alla versione 4 dello schema una piccola tabella chiave/valore, `meta` (`db.version(4).stores({ meta: 'key' })`). Aggiungere una tabella **non richiede un `upgrade`** dei dati esistenti: Dexie la crea al primo avvio dopo l'aggiornamento (verificato su un database della versione 3: apre alla versione 4 senza perdere nulla). La tabella può ospitare, in seguito, altri dati dello stesso tipo.

### Il backup la porta con sé

Nel file di backup compare una riga `"meta":[…]` tra i progressi e i capitoli. In fase di ripristino:

- un backup **con** la riga sostituisce la tabella (il punto di partenza torna quello salvato);
- un backup **senza** la riga (fatto prima di questa fase, o nel vecchio formato a JSON unico) **lascia la tabella com'è**: ripristinare un file vecchio non deve far perdere il punto di partenza.

## 6. Verifica

In sandbox (anche a 375 px):

- database della v3 → v4 senza perdite; `/settings` reindirizza a `/profilo`; la terza voce della barra si chiama "Profilo", con l'icona della persona;
- la card mostra 2 serie, 2 volumi, 5 capitoli e 35 pagine su dati noti (10+5+20);
- il menu della chiave inglese ha le tre voci, ognuna apre la sua pagina con il titolo e il link "indietro"; il backup mostra i suoi pulsanti; l'indirizzo sconosciuto torna al Profilo;
- **reset**: Annulla non cambia nulla; Conferma → 0 pagine, **le tre righe di progresso restano** e "Continua a leggere" è ancora disponibile; +5 pagine di lettura → 5; progresso azzerato → 0 e il punto di partenza scende a 0; nuova lettura → 10;
- **backup**: l'esportazione contiene la riga `meta`; il ripristino la ripristina; un file senza riga o nel vecchio formato lascia il punto di partenza com'è;
- lint e build passano.

Cosa **non** è stato verificato: il tablet; il menu su schermi molto stretti oltre ai 375 px provati.

## 7. Cosa si è imparato

- **Spostare ciò che interessa di più in primo piano**: le priorità dell'utente guidano la struttura, non il contrario.
- **Dividere un componente grande senza riscriverlo**: un parametro e qualche condizione bastano; il comportamento già provato non cambia.
- **Un dato derivato non si azzera: si fa il "conto dal punto di partenza"**, e si pensa a cosa succede quando la fonte scende.
- **Aggiungere una tabella a Dexie è un cambio di versione senza migrazione**; il backup però deve saperne.
