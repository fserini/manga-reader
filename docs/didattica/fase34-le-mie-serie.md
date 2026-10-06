# Fase 34 — La lista "Le mie serie"

> **Aggiornamento (Fase 37)**: da allora ogni serie in libreria ha uno stato ("da leggere" se mai aperta), quindi sono tutte nella lista; i suggerimenti della 34b nel "+" non ci sono più e la modifica vale anche per le serie in libreria. Vedi [`fase37-lista-rifiniture.md`](fase37-lista-rifiniture.md).
>
> La scheda Profilo (Fase 35) aveva il guscio e le statistiche. Qui arriva il contenuto: **una sola card, una sola lista** di titoli con quattro filtri a chip (Preferiti, In corso, Finiti, Da leggere). I Preferiti escono dalla Libreria e vengono qui. Il disegno è stato approvato su un mockup prima di scrivere codice.

---

## 1. Due fonti, una lista

I titoli della lista vengono da due posti:

- le **serie della libreria**: quelle con la stella, e quelle che hanno uno **stato ricavato dalla lettura**;
- le **voci manuali**, scritte dall'utente (anche di manga che non ha), in una tabella nuova.

Lo stato di una serie in libreria non si salva: si **calcola**. È "finita" se tutti i suoi capitoli sono finiti (letti fino in fondo o segnati a mano), "in corso" se ne ha iniziato almeno uno, nessuno stato altrimenti. Un titolo con la sola stella e nessuno stato compare solo sotto Preferiti: la stella è un'**etichetta**, non uno stato.

Le serie della libreria che non hanno né stella né stato non fanno parte della lista: stanno solo nel Catalogo.

## 2. Una tabella per ciò che è solo dell'utente

Si aggiunge la versione 5 dello schema con `readingList` (titolo, stato, nota, data), che contiene **solo le voci manuali**. In corso, Finiti automatici e Preferiti si ricavano ogni volta dalla libreria e non si duplicano. Una voce manuale **non crea mai una serie vuota nel Catalogo**.

Il backup porta con sé la lista (una riga `"readingList"` nel file). Come per la tabella `meta` della Fase 35, un backup senza quella riga (fatto prima di questa fase, o nel vecchio formato a JSON unico) **lascia la lista com'è**: ripristinare un file vecchio non deve cancellare ciò che l'utente ha scritto dopo.

## 3. Quando una voce manuale e una serie sono lo stesso titolo

Se si scrive a mano "One Piece" e in libreria c'è già "One Piece", nella lista deve comparire **un titolo solo**. `getMyListItems` confronta i titoli dopo averli normalizzati (stesso confronto della rinomina: senza maiuscole, accenti e punteggiatura) e **unisce** la voce alla serie: il titolo ha ora la stella (è in libreria) e una nota. Lo stato che conta è quello ricavato dalla lettura; solo se la serie non ne ha uno, vale quello scelto a mano. Così una voce "Da leggere" che inizi a leggere passa da sola in "In corso", senza un'azione in più.

Un titolo già presente nella lista (come voce manuale, o come serie con stella o stato) è **rifiutato** con un messaggio; una serie della libreria che non fa ancora parte della lista, invece, si può aggiungere.

*Nota sul piano: la roadmap divideva il lavoro in 34a e 34b. Il confronto per nome e l'unione automatica sono tanto piccoli che erano ormai parte del cuore della 34a; resta alla 34b il collegamento esplicito (scegliere la serie mentre si scrive il titolo) e l'avviso quando una serie collegata viene rimossa.*

## 4. La card nel Profilo

`MySeriesCard` mostra il titolo con il conteggio, **quattro chip con i numeri** (uno solo selezionato, di partenza **Preferiti**, ricordato in locale da una visita all'altra) e **una riga** di anteprima dei titoli del chip scelto. Se il chip è vuoto, la card mostra comunque titolo e chip con un messaggio sotto. Toccando la card (non i chip) si apre la lista completa, già su quel chip.

### Una riga di titoli, senza media query

Il numero di titoli per riga dipende dalla larghezza: 3 sul telefono, 5 sul tablet. Invece di una media query (l'app non ne usa per il layout) si usa una **griglia con una riga sola visibile**:

```css
grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
grid-template-rows: auto;   /* la prima riga ha la sua altezza */
grid-auto-rows: 0;          /* ogni riga creata in più vale 0 */
overflow: hidden;
```

Si disegnano sempre 5 tessere; la griglia crea tante colonne quante ne entrano, e quelle che vanno a capo finiscono in righe da 0 pixel, nascoste. Un dettaglio che ha richiesto una correzione: **senza `grid-template-rows: auto`** anche la prima riga è "creata da sola" e vale 0, quindi l'anteprima spariva del tutto. Lo si è visto misurando l'altezza della griglia (0 px). Poi, a 375 px entrava solo 2 tessere per un margine: con la larghezza minima a 96 px servivano 308 px e ce n'erano 305; scendendo a 88 px, ne entrano 3.

## 5. La lista a pagina intera

A `/profilo/serie` (un indirizzo vero: il tasto indietro funziona): i chip, la **ricerca** per titolo, l'**ordinamento** (ultima lettura, aggiunti di recente, alfabetico con i numeri "naturali") e la griglia. Il tocco su un titolo dipende dal suo stato:

- **In corso** e in libreria: finestra "Continuare la lettura?" con il punto esatto (volume, capitolo, pagina). "Continua" apre il Lettore. Il pulsante "Continua" è **il tocco che serve a chiedere il permesso di lettura sul file**, come l'attuale "Riprendi": la richiesta parte da lì.
- **In libreria** (Preferiti, Finiti, Da leggere): porta alla Libreria **direttamente sulla serie**. La Libreria riceve la serie da aprire nello stato della navigazione (`navigate('/', { state: { openSeriesId } })`) e il Catalogo la apre una volta sola, appena ha caricato le serie.
- **Non in libreria**: un **avviso giallo** ("non è presente in libreria"). Il giallo è un colore nuovo (`--warn`): è distinto dall'azzurro delle informazioni e dal rosso degli errori.

La **stella** sta su ogni titolo in libreria e si accende e si spegne allo stesso modo ovunque. Le voci manuali **senza** collegamento non hanno la stella: i preferiti sono serie della libreria.

### Modalità Modifica

La matita attiva la modalità: compaiono una **"x"** su ogni voce manuale (con conferma), una card **"+"** per aggiungere, e il tocco su una voce manuale apre la finestra di **modifica** (titolo, stato, nota) — così si passa una voce da "Da leggere" a "Letto" senza cancellarla e riscriverla. Le voci automatiche (serie in libreria) non hanno la "x": non si tolgono a mano. Il titolo duplicato è bloccato, escludendo la voce stessa quando si modifica.

## 6. I Preferiti escono dalla Libreria

La sezione "Serie preferite" della Libreria, il componente `Favorites` e il suo stile sono stati **cancellati**, insieme al suggerimento chiudibile "nessun preferito" della Fase 26 e al suo piccolo modulo (`hints.js`): lo sostituisce la card, che mostra sempre titolo e messaggio. Sparisce anche il passaggio di "contatori" tra Libreria, Catalogo e Preferiti introdotto nella Fase 33: ora le due viste stanno su schede diverse e **ognuna carica i suoi dati quando si apre**, quindi non c'è più nulla da tenere allineato.

## 7. Due errori trovati per strada

- Il link "indietro" delle pagine delle impostazioni (Fase 35) usava un'icona `back` che **non esisteva** nell'elenco delle icone: non mostrava niente. Ora l'icona c'è (insieme a `search`).
- L'anteprima invisibile della griglia (vedi sopra), trovata misurando.

## 8. Verifica

In sandbox (anche a 375 px), con dati noti:

- database alla versione 5; la lista calcola gli stati attesi (serie con progresso parziale → in corso 25%, tutta letta → finita, solo stella → solo Preferiti, voce manuale con lo stesso titolo di una serie → un titolo solo);
- card: quattro chip con i numeri giusti, chip di partenza Preferiti, scelta ricordata dopo aver cambiato pagina; anteprima di **una riga**, 3 tessere visibili su 5 a 375 px;
- lista completa: filtro di partenza ricordato, ordinamento alfabetico, ricerca, stella che si accende e si spegne;
- Modifica: banner, "+" e "x" solo sulle voci manuali; titolo vuoto e duplicato respinti; aggiunta (il filtro passa allo stato scelto); modifica di una voce da "Da leggere" a "Letto"; conferma di rimozione;
- tocco: finestra "Continuare la lettura?" con i dati giusti e "Continua"; avviso giallo per un titolo non in libreria; apertura della Libreria **direttamente sulla serie**; la Libreria non ha più la sezione Preferiti;
- backup: la riga `readingList` viaggia nel file e si ripristina; un file senza riga lascia la lista com'è;
- lint e build passano.

Cosa **non** è stato verificato: il tablet; l'apertura vera di un capitolo da "Continua" (in sandbox il capitolo di prova non ha un file collegato: l'avviso "File non disponibile" ha dimostrato che la richiesta parte, non che il Lettore si apra); la griglia a pagina intera con molte decine di titoli.

## 9. Fase 34b — Il collegamento con le serie in libreria

Nella 34a una voce manuale si univa a una serie solo se i **titoli coincidevano**. È fragile: basta una rinomina (della serie, o della voce) e il legame si spezza. La 34b aggiunge un **legame esplicito**: la voce ricorda *quale* serie è, per id.

### Come si crea

Scrivendo il titolo nella finestra di aggiunta, l'app **suggerisce le serie in libreria** il cui titolo contiene il testo (dopo la normalizzazione: senza maiuscole, accenti, punteggiatura). Scegliere un suggerimento mette il titolo della serie, mostra "Collegato a una serie in libreria" e salva l'id (`seriesId`) con la voce. Cambiare il testo a mano **toglie** il legame. Non si suggeriscono le serie **già presenti nella lista** (sarebbero un duplicato), tranne la serie della voce che si sta modificando.

### Come si trova la serie, in ordine

`getMyListItems` cerca la serie di una voce così:

1. per **legame esplicito** (`seriesId`): regge alla rinomina — la voce mostra il nuovo titolo della serie;
2. se non c'è, o se quella serie non esiste più, per **titolo normalizzato**; un legame trovato per nome **si salva** subito, così da quel momento non dipende più dal titolo (stesso effetto se si importa in seguito una serie con quel nome: la voce "Da leggere" si ricollega e la stella diventa disponibile);
3. se la voce era collegata e la serie è sparita senza una sostituta, resta una voce a sé, segnata **rimossa** (`linkRemoved`): nella griglia ha l'etichetta RIMOSSA e il tocco mostra un avviso giallo ("è stato rimosso dalla libreria"), diverso da "non è presente in libreria" delle voci mai collegate.

Il controllo dei duplicati considera anche l'id: la stessa serie non può comparire due volte, comunque sia scritto il titolo.

### Una scelta tolta

Avevo messo accanto al legame un pulsante "Scollega". Provandolo, **non faceva niente di utile**: se il titolo coincide con quello di una serie in libreria, il confronto per nome (punto 2) ricollega subito la voce. Un controllo che sembra funzionare e invece no è peggio di nessun controllo: l'ho tolto. Per slegare una voce basta cambiarne il titolo.

### Verifica (sandbox)

- scrivendo "omega" si suggeriscono le serie in libreria che non sono già nella lista; "alfa" non suggerisce nulla perché quella serie ha la stella (una correzione: un test ha mostrato che il filtro non escludeva le serie già presenti, per un confronto `null` contro `null`);
- scegliere un suggerimento salva `seriesId` e mostra l'indicazione; un titolo uguale a quello di una serie già in lista è respinto;
- **rinominando** la serie collegata la voce segue il nuovo titolo; **rimuovendola** la voce resta, con l'etichetta RIMOSSA e l'avviso giallo dedicato;
- **reimportando** una serie con lo stesso titolo la voce si ricollega e il legame si salva; una voce libera si collega da sola quando arriva la serie;
- lint e build passano.

Non verificato: il tablet.

## 10. Cosa si è imparato

- **Un dato che si può ricavare non si salva**: lo stato di una serie in libreria si calcola dalla lettura, e così non può andare fuori sincrono.
- **Unire invece di duplicare**: lo stesso titolo da due fonti diventa una sola voce, con una regola chiara su quale stato vince.
- **Misurare i layout "furbi"**: una griglia che nasconde le righe in più ha un errore facile (la prima riga vale 0), e si vede solo misurando.
- **Un mockup non è un test**: nel mockup la riga di anteprima aveva lo stesso difetto, e nessuno se ne era accorto finché non si è guardato il layout vero.
