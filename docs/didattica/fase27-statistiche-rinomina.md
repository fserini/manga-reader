# Fase 27 — Statistiche di lettura e rinomina

> Ultima fase del gruppo nato dall'analisi complessiva (vedi la [Fase 24](fase24-comfort-lettura.md)). Due funzioni indipendenti: capire **quanto si è letto** e poter **correggere un titolo sbagliato** senza rimuovere e ricategorizzare.

---

## 1. Statistiche: cosa si può davvero sapere

Prima di scrivere codice conviene chiedersi **quali dati esistono**. Il database ricorda, per ogni capitolo, a che pagina si è arrivati (`lastPageRead`), quante pagine ha (`totalPages`) e quando è stato letto l'ultima volta. **Non registra il tempo passato a leggere.** Ne vengono due conseguenze, dichiarate anche nell'interfaccia:

- le **pagine lette** sono una stima: contano l'ultima pagina raggiunta, non le volte in cui si è tornati indietro;
- il **tempo** non è misurato: è un calcolo a 20 secondi a pagina (`SECONDS_PER_PAGE`). Misurarlo davvero richiederebbe di cronometrare le sessioni di lettura, una funzione a parte con le sue trappole (l'app lasciata aperta, la pausa); per ora un numero onesto con la sua formula, scritta sotto il titolo della sezione, vale più di una precisione finta.

Cosa mostra la sezione **Impostazioni → Statistiche di lettura**:

| Voce | Come si calcola |
|---|---|
| Pagine lette | per ogni capitolo, `lastPageRead + 1`; se è finito, tutte le sue pagine |
| Capitoli finiti | letti fino in fondo, **oppure** segnati come letti a mano (Fase 25) |
| Capitoli iniziati | tutti quelli con un progresso, più quelli segnati a mano |
| Tempo stimato | pagine lette × 20 s, in "3 h 20 min" o "45 min" |
| Serie più lette | le prime 5 per pagine lette, con una barra proporzionale alla prima |
| In libreria | numero di serie, volumi e capitoli |

Un caso da gestire: un capitolo **segnato come letto** a mano può non avere nessun progresso (si è segnato tutto il volume senza aprirlo). Conta come "finito", ma le sue pagine non si conoscono e quindi non si sommano: meglio sottostimare che inventare.

### Dove vive il calcolo

`getReadingStats()` in `db.js`. Legge i progressi, recupera i capitoli collegati con **un solo** `bulkGet` e raggruppa per serie in memoria; i capitoli segnati a mano si trovano con un filtro (nessun indice: sono righe leggere dopo la Fase 30a, quando le miniature sono passate in un'altra tabella). Si calcola una volta, all'apertura delle Impostazioni, e se fallisce il resto della pagina funziona lo stesso (come la stima del backup).

Il testo "1 capitolo letto / 5 capitoli letti" ha due numeri nella stessa frase: i18next gestisce un solo `count` per frase, quindi pagine e capitoli sono due chiavi plurali separate (`statsTopPages`, `statsTopChapters`) composte in una terza.

## 2. Rinomina di Serie e Volume

Un'icona a matita su ogni riga di Serie e di Volume nel Catalogo apre `RenameDialog`, che riusa l'aspetto dei form di categorizzazione.

- **Serie**: si cambia il titolo.
- **Volume**: un volume ha **solo un numero**, quindi "rinominarlo" è cambiarne il numero. I suoi capitoli restano dove sono; la nota nel dialog lo dice.

### Le regole stanno nel database, non nel form

`renameSeries` e `renumberVolume` (in `db.js`) rifiutano un nome già esistente lanciando un errore con `code: 'duplicate'`; il dialog lo trasforma in un messaggio. Il controllo avviene **dentro la transazione**, subito prima di scrivere: se stesse solo nel form, due modifiche ravvicinate potrebbero comunque creare un duplicato.

- Due titoli sono "uguali" se lo sono dopo la normalizzazione già usata dalla Fase 23 (`normalizeTitle`: senza maiuscole, accenti e punteggiatura): "One Piece", "one-piece" e "ONE PIECE!" sono la stessa serie. Se il titolo è fatto solo di simboli e non resta nulla da confrontare, si ripiega sul testo in minuscolo.
- Due volumi della stessa serie non possono avere lo stesso numero.
- Il form controlla le cose ovvie (titolo vuoto, numero mancante), ma un campo `type="number"` con `min="0"` fa già scattare la **validazione nativa del browser** per un numero negativo, prima ancora che il codice del form venga eseguito.

Dopo una rinomina il Catalogo ricarica il livello corrente e **invalida la ricerca globale** (che porta con sé titoli e numeri di volume) e fa aggiornare i **Preferiti**, che mostrano il titolo della serie accanto ai loro volumi e capitoli: senza, avrebbero continuato a mostrare il vecchio nome.

## 3. Un effetto collaterale sul layout

Con cinque pulsanti d'azione su una riga di volume (matita, copertina, "letto", preferito, cestino), a 375 px di larghezza il titolo veniva troncato in "Volu…". Ora lo stato "1/5 letti" **va a capo sotto il titolo** quando la riga è stretta (`flex-wrap` sul pulsante principale e `flex: 1 1 6em` sul testo), e il titolo si legge per intero. Nessuna media query: è lo stesso layout fluido di tutta l'app.

## 4. Verifica

In sandbox, con dati di cui si conosceva il risultato:

- **Statistiche**: tre capitoli di una serie (uno finito, uno a metà, uno appena aperto), uno di un'altra serie a pagina 5 e un capitolo segnato a mano → 36 pagine lette, 5 capitoli iniziati, 2 finiti, 12 minuti: coincide con il calcolo a mano. Classifica serie corretta, barre proporzionali, testo plurale corretto, sezione vuota se non si è letto nulla.
- **Rinomina serie**: titolo vuoto e titolo duplicato ("one-piece!" contro "One Piece") respinti con messaggio; un titolo valido salvato, mostrato nel Catalogo e **aggiornato nei Preferiti** senza ricaricare la pagina.
- **Rinomina volume**: numero duplicato e numero mancante respinti; "4" → "7" salvato, elenco riordinato, capitolo al suo posto.
- A 375 px, riga di volume con i cinque pulsanti leggibile.
- Lint e build passano.

Cosa **non** è stato verificato: il tablet; le statistiche con una libreria molto grande (la lettura di tutti i progressi e di un `bulkGet` è la stessa delle altre query della Fase 30a, ma non è stata cronometrata a 9.000 capitoli); la ricerca globale dopo una rinomina (invalidata per costruzione, non osservata).

## 5. Cosa si è imparato

- **Partire dai dati disponibili**: le statistiche possibili sono quelle che il database sa già; ciò che richiede un dato nuovo (il tempo vero) è una funzione a parte.
- **Dire quando un numero è una stima**: con la formula visibile, un numero approssimativo è onesto.
- **Le regole di unicità vanno nel database**, dentro la transazione, non (solo) nel form.
- **Quando i dati cambiano, chi li mostra altrove va avvisato**: ricerca e Preferiti tenevano una copia del titolo.
- **Un'aggiunta all'interfaccia si prova nel caso più stretto** (375 px): ha mostrato un problema che il desktop nascondeva.
