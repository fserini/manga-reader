# Fase 29b — Importazione, Lettore e Libreria

> Seconda metà della Fase 29 (decisioni in [ADR-002](../decisions/ADR-002-barra-di-navigazione-e-marchio.md)). La 29a ha cambiato l'aspetto; qui cambia come si usano le due schede principali: la **Libreria** è ciò che possiedi, il **Lettore** è ciò che stai leggendo, e l'app si apre dove ha più senso.

---

## 1. Importazione con un'icona

I due pulsanti di testo "Importa file" / "Importa cartella" diventano un'unica icona "+" (`ImportMenu.jsx`) con una tendina: **File** (con l'elenco dei formati accettati) e **Cartella** ("anche le sottocartelle"). Si chiude toccando fuori, con Escape o scegliendo una voce.

Un dettaglio che conta: i selettori di file del browser si aprono **solo in risposta a un gesto dell'utente**. Per questo `choose(handler)` chiude la tendina e chiama il gestore *nello stesso passaggio* del tocco, senza aspettare niente di asincrono prima.

## 2. La logica di import esce dalla pagina

La funzione `importHandles` (riconosci i formati, blocca i duplicati, valida, importa) viveva dentro `Library.jsx`. Ora la usano due pagine, quindi è passata in un modulo suo, `importFiles.js`, che non sa nulla di React: prende degli handle e restituisce un riepilogo. La Libreria lo mostra come prima.

Nello stesso modulo c'è una funzione nuova, `resolveFileToChapter`, per il file scelto dal Lettore (punto 3).

## 3. Il Lettore a vuoto riconosce i file

Prima, la scheda Lettore senza un capitolo aperto era un solo pulsante "Scegli file", rimasto dalla Fase 3, quando il Lettore era un proof of concept. Un file scelto da lì si leggeva **"a vuoto"**: nessuna ricerca in libreria, nessuna pagina ripristinata, nessun segnalibro o preferito, nessun progresso salvato (quindi nemmeno nelle statistiche o in "Ultimi letti"), nessuna copertina.

Ora `/reader` è una pagina a sé (`ReaderHome.jsx`) e `Reader.jsx` si occupa solo di leggere un capitolo (`/reader/:id`). "Apri un file…" passa da `resolveFileToChapter`:

1. un formato non supportato viene rifiutato con il suo messaggio (con la nota sul PDF);
2. il nome del file viene cercato **in libreria**, come per i duplicati dell'import: se c'è, si apre *quel* capitolo, con pagina, segnalibro, preferiti e statistiche già suoi;
3. se non c'è, si valida (archivio leggibile, senza password) e si importa come capitolo da categorizzare, poi si apre.

Per un capitolo già noto si **sostituisce l'handle** con quello appena scelto: l'utente ha appena dato il permesso su *quel* file, mentre quello salvato potrebbe averlo perso o puntare a un file spostato.

Conseguenza da gestire: un capitolo importato così non è categorizzato, quindi non ha un numero (`null`). Senza attenzioni l'interfaccia scriverebbe "Cap null". `chapterLabel` ricade sul nome del file ovunque serva (card, sezioni, conferma di rimozione), e `enrichChapter` in `db.js` ora restituisce anche `fileName`.

## 4. "Continua a leggere"

`getContinueTarget()` in `db.js` decide cosa proporre: il capitolo letto per ultimo. Se quello è già **finito** e nello stesso volume ne segue un altro, propone il successivo (`isNext`, parte dall'inizio, con l'etichetta "Capitolo successivo"); altrimenti riprende lo stesso con il suo avanzamento. Guarda le ultime 5 righe di progresso e non solo la prima, per non restare a mani vuote davanti a un progresso orfano (capitolo nel frattempo rimosso).

`ContinueCard` è puramente presentazionale (i dati e l'apertura li gestisce chi la usa) e sta solo nella scheda Lettore (copertina, titolo, avanzamento, "Riprendi" a tutta larghezza). *Nota: in origine esisteva anche una forma **compatta** in cima alla Libreria; è stata tolta in un fix successivo perché duplicava le informazioni del Lettore.* "Riprendi" passa dal solito controllo del permesso, ora raccolto nel hook `useChapterOpener`, che prima era copiato in tre componenti.

## 5. La Libreria riordinata

In Libreria, dall'alto: il titolo con il "+", la card "Da categorizzare" (solo se c'è), il **Catalogo con la sua ricerca**, e i Preferiti sotto. "In corso di lettura" e "Ultimi letti" sono passati nel Lettore. Prima il Catalogo, la parte più usata, finiva dopo fino a cinque sezioni; e le due sezioni di lettura duplicavano ciò che il Lettore mostra ora.

Piccole conseguenze: il titolo "蔵書 Libreria" porta ora l'eyebrow in giapponese (che era sul titolo "Catalogo"); `ReadingSections` espone un `onChanged` per far aggiornare la card "Continua a leggere" dopo una rimozione manuale.

## 6. La pagina iniziale

Se l'app **si avvia** sulla radice e c'è già qualcosa da continuare, si atterra sulla scheda Lettore. `useStartRedirect` rispetta tre regole, che sono il vero lavoro di questa funzione:

- **Solo all'avvio.** La decisione si prende una volta, al primo render, e `ready` non torna mai a `false`. Se scattasse a ogni visita alla radice, toccare "Libreria" ti rimanderebbe al Lettore e non potresti più aprirla.
- **Solo se l'indirizzo di avvio è la radice.** I link diretti (`/settings`, `/reader/12`) restano dove sono.
- **`replace`, non una navigazione normale**, così il tasto indietro non resta intrappolato tra radice e Lettore.

Si atterra sul Lettore e **non dentro il capitolo** perché il permesso di lettura sul file, dopo la chiusura dell'app, va richiesto durante un tocco: "Riprendi" è quel tocco. Finché la decisione non è presa (qualche decina di millisecondi, il tempo di leggere un'unica riga dal database) le pagine non si disegnano, per non mostrare la Libreria per un istante e poi cambiare.

In **Impostazioni → Aspetto** la preferenza ha tre valori: *Automatica* (predefinita: Lettore se c'è qualcosa da continuare, altrimenti Libreria), *Libreria*, *Lettore*. Chi aveva già salvato marchio e menu prima di questa fase ottiene semplicemente il predefinito per la pagina iniziale (`loadPrefs` completa i campi mancanti).

## Cosa NON è cambiato

- La lettura di un capitolo, i controlli, il progresso, i segnalibri, le statistiche.
- Le regole di import (formati, duplicati, ricollegamento dopo un ripristino, avvisi).
- La coda "Da categorizzare" e il Catalogo.

## Verifica

In sandbox, con file reali nell'OPFS del browser (handle veri) restituiti ai selettori al posto della finestra di sistema:

- **Avvio:** radice con progresso → Lettore; preferenza *Libreria* → resta; preferenza *Lettore* → Lettore; *Automatica* **senza** progresso → Libreria (e nessuna card "Continua"); `/settings` come link diretto → resta; dopo il reindirizzamento, toccare "Libreria" non rimbalza.
- **Libreria:** ordine delle sezioni, riga compatta, "Da categorizzare", Catalogo; il menu "+" (voci, formati, chiusura con Escape/tocco fuori/scelta) e l'import tramite il modulo condiviso (importato, duplicato, PDF segnalato).
- **Lettore:** "Riprendi" apre il capitolo giusto alla pagina giusta; "Apri un file…" con un file già noto (apre il capitolo esistente, nessun duplicato), un file nuovo (importato e aperto), lo stesso di nuovo (non si duplica), un PDF e un archivio con password (messaggi, nessuna navigazione); riaprendo un file si ritrova la pagina; i capitoli non categorizzati mostrano il nome del file invece di "Cap null".
- **Telefono (375 px):** Lettore e Libreria senza scorrimento orizzontale, tendina del "+" dentro lo schermo.
- `npm run lint` e `npm run build` puliti.

**Da verificare su dispositivo reale** (Federico, fuori sandbox): il reindirizzamento all'avvio dall'icona sulla home (cold start di una PWA installata), "Riprendi" dopo la chiusura dell'app (il permesso sul file viene richiesto di nuovo), e "Apri un file…" con il selettore vero di Android.
