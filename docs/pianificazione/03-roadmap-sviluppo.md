# Manga Reader PWA — Roadmap di Sviluppo

> Elenco delle fasi di sviluppo, pensate come piccoli step incrementali. Ogni fase corrisponde (salvo indicazione diversa) a una branch `feature/` del GitFlow, con la propria documentazione dedicata in `/docs`.

---

## Fase 0 — Setup del progetto

- Creazione repository GitHub (pubblico)
- Impostazione branch `main` e `develop`
- Scaffolding progetto con Vite + React (JavaScript)
- Configurazione base: ESLint/Prettier, struttura cartelle, `.gitignore`
- Primo commit, primo push, verifica che l'app di base parta in locale
- Setup GitHub Actions (pipeline vuota/di verifica, il deploy vero arriva più avanti)

## Fase 1 — Struttura dell'app (shell)

- Setup di React Router
- Creazione delle viste principali vuote: Libreria, Lettore, Impostazioni
- Layout base di navigazione tra le viste

## Fase 2 — PWA di base

- Configurazione `vite-plugin-pwa`
- Manifest (nome app, icone, colori)
- Service worker minimo, verifica installabilità su tablet Android
- Test: l'app si installa e si apre offline (anche se ancora vuota)

## Fase 3 — Lettura di un singolo CBZ (proof of concept)

- Import di un solo file CBZ tramite file picker classico
- Estrazione immagini con `JSZip`
- Visualizzazione base delle pagine (senza ancora modalità multiple, solo sequenza semplice)
- Obiettivo: validare l'intera catena "file → immagini → schermo" prima di costruirci sopra

## Fase 4 — Supporto CBR

- Integrazione `libarchive.js`
- Estensione della logica di Fase 3 per supportare anche l'estrazione da file CBR

## Fase 5 — Modalità di lettura

- Pagina singola
- Doppia pagina (spread)
- Scroll verticale continuo
- Selettore di modalità
- Direzione di lettura LTR/RTL (default giapponese), determina ordine di split e affiancamento in doppia pagina
- Split automatico delle pagine più larghe che alte in modalità pagina singola (canvas, formato-agnostico: stessa logica per CBZ e CBR)
- Occasione per definire un linguaggio visivo più moderno (lo stile "blando" attuale è solo il template di partenza Vite/React), da riportare poi anche sulla Libreria nelle fasi successive

## Fase 6 — Controlli di navigazione in lettura

- Tap sui bordi → pagina prec/succ (verso dipendente dalla direzione di lettura impostata in Fase 5)
- Doppio tap → passa da pagina singola a doppia pagina (non più zoom)
- Pinch-to-zoom (unico gesto di zoom)
- Tap centrale (mostra/nasconde interfaccia)
- Rotazione libera portrait/landscape

## Fase 7 — Persistenza dati: setup IndexedDB

- Integrazione `Dexie.js`
- Definizione schema dati (Serie, Volumi, Capitoli, metadati file)
- Nessuna UI ancora: solo il "motore dati" funzionante e testabile

## Fase 8 — Import multiplo e sezione "Da categorizzare"

- Import di più file contemporaneamente (file singoli o cartella)
- Rilevamento duplicati con blocco import
- UI della sezione "Da categorizzare"
- Libreria vuota: invito all'import in evidenza al centro schermo (tap per aprire il file picker), al posto del solo pulsante standard

## Fase 9 — Categorizzazione manuale

- Form per assegnare Serie/Volume/Capitolo a un file
- Salvataggio dell'associazione in IndexedDB

## Fase 10 — Vista Libreria (Serie → Volumi → Capitoli)

- Navigazione gerarchica a tre livelli
- Collegamento tra libreria e lettore (apertura capitolo dalla libreria)
- Anteprima visiva (miniatura della prima pagina) e nome per ogni voce del catalogo

## Fase 11 — Rimozione elementi

- Rimozione manuale di Serie/Volume/Capitolo
- Popup di conferma
- Scelta rimozione solo libreria vs anche file fisico
- Rimozione automatica dei riferimenti a file non più trovati

## Fase 12 — Progresso di lettura

- Tracking automatico dell'ultima pagina letta per capitolo (segnalibro automatico: riapertura dall'ultima pagina letta)
- Segnalibro manuale (icona dedicata per marcare esplicitamente il punto di lettura, indipendente dal tracking automatico)
- Indicatore di completamento per capitolo/volume, derivato da pagina-corrente/pagine-totali
- Sezione "in corso di lettura"
- Sezione "ultimi letti"

## Fase 13 — Preferiti

- Marcatura Serie/Volume/Capitolo come preferito
- Sezione dedicata ai preferiti

## Fase 14 — Ricerca e ordinamento

- Ricerca testuale nella libreria
- Ordinamento (alfabetico, ultimi letti, ecc.)

## Fase 15 — Gestione errori

- Gestione file corrotti/non validi in fase di import
- Gestione errori in fase di lettura (immagini illeggibili)
- Messaggi utente chiari e comprensibili

## Fase 16 — Backup e ripristino dati

- Export dei dati (libreria, progressi, preferiti) su file
- Import/ripristino da file di backup

## Fase 17 — Tema chiaro/scuro

- Toggle manuale tema chiaro/scuro
- Persistenza della preferenza scelta

## Fase 18 — Internazionalizzazione (i18n)

- Setup libreria i18n
- Traduzione interfaccia in italiano e inglese
- Selettore lingua nelle impostazioni

## Fase 19 — Aggiornamenti PWA

- Notifica/banner quando è disponibile una nuova versione dell'app

## Fase 20 — Deploy pubblico e rifinitura

- Setup completo GitHub Actions → deploy automatico su GitHub Pages
- Test di installazione reale sul tablet Android da URL pubblico
- Rifinitura generale, revisione UX, controllo di tutte le feature funzionali definite in analisi

---

## Fase 21 — Restyling grafico ("Yomihon")

> Fase fuori dalla roadmap MVP originale, aperta a roadmap chiusa. Decisione e motivazioni in [`docs/decisions/ADR-001-restyling-visivo-yomihon.md`](../decisions/ADR-001-restyling-visivo-yomihon.md).

- Nuovi design token (colori, font) applicati globalmente, in sostituzione dell'attuale palette generica
- Catalogo: copertine verticali stile dorso, con titolo/eyebrow in giapponese
- Lettura: interfaccia minimale (filo di avanzamento + numero in monospace), pannello controlli a 5 icone rivelato solo al tocco
- Impostazioni: stessa grammatica grafica del Catalogo
- Verifica responsive su più risoluzioni (telefono, tablet verticale/orizzontale), inclusa la nuova barra flottante dei controlli di lettura
- Verifica della resa delle pagine manga sui vari schermi, a cura di Federico su dispositivo reale (fuori sandbox)

---

## Fase 22 — Coda di categorizzazione dedicata e copertine per livello

> Decisa in conversazione dopo il primo utilizzo reale: con un import di ~20 capitoli insieme, la lista "Da categorizzare" occupava per intero la pagina principale della Libreria; inoltre la stessa copertina (reale o segnaposto "dorso") veniva mostrata identica a livello Serie, Volume e Capitolo, rendendo i tre livelli difficili da distinguere a colpo d'occhio.

- **Coda di categorizzazione spostata fuori dalla pagina principale**: in Libreria resta solo un riquadro riepilogo ("N capitoli da categorizzare" + invito), non invasivo e assente del tutto quando non c'è nulla in sospeso; tocandolo si apre una vista dedicata (`/uncategorized`) con l'elenco completo e il form di categorizzazione esistente, invariato nella logica
- **Copertine solo a livello Capitolo**: Serie e Volumi, livelli di sola aggregazione senza un'immagine propria, passano da griglia-di-copertine a elenco testuale (titolo/numero, stato letti, preferito, rimozione); la copertina reale (o il segnaposto "dorso") resta solo sul Capitolo, l'unico livello che ha davvero un'immagine associata
- Base su cui innestare, in una fase successiva, la selezione multipla e il riconoscimento automatico da nome file (vedi Fase 23)

---

## Fase 23 — Categorizzazione assistita e multipla

> **Completata** — decisa in conversazione dopo il feedback su un import di ~20 capitoli insieme, categorizzabili solo uno alla volta. Si appoggia alla vista dedicata introdotta in Fase 22. Dettagli in [`docs/didattica/fase23-categorizzazione-assistita.md`](../didattica/fase23-categorizzazione-assistita.md): il suggerimento dal nome del file è sempre modificabile; un nome senza sigle ("scan_final.cbz") viene letto comunque come serie.

- **Categorizzazione singola (dialog esistente)**: Serie/Volume/Numero capitolo pre-compilati analizzando il nome del file (numero capitolo e volume via pattern tipo `c12`/`ch.12`/`v01`; suggerimento di una Serie già esistente in libreria se il nome vi somiglia) — sempre modificabile, mai un riempimento automatico bloccante; se il parsing non trova nulla, i campi restano vuoti come oggi
- **Selezione multipla**: checkbox sulle righe di "Da categorizzare", barra azioni quando almeno un capitolo è selezionato, assegnazione della Serie in blocco a tutti i selezionati
- **Interruttore "Stesso volume per tutti i capitoli selezionati"** (attivo di default): se attivo, un solo campo Volume per l'intero batch, poi solo i numeri di capitolo riga per riga (pre-compilati dal nome file); se disattivo, Volume torna modificabile per ogni riga insieme al numero — copre anche i batch che mischiano più volumi

---

## Fase 24 — Comfort di lettura

> Decisa in conversazione dopo un'analisi complessiva dell'app alla ricerca di funzionalità mancanti e rifiniture — prima fase di un gruppo di quattro (24-27) nate dalla stessa discussione. Tocca soprattutto il Lettore.

- **Preferenze di lettura persistenti**: modalità (singola/doppia/scroll) e direzione (RTL/LTR) oggi ripartono sempre dai valori di default ad ogni apertura di un capitolo; l'ultima scelta dell'utente viene ricordata (salvata localmente) invece di essere richiesta ogni volta
- **Spread automatico in landscape**: ruotando il tablet in orizzontale, passaggio automatico a doppia pagina se l'utente non ha scelto esplicitamente un'altra modalità per quel capitolo
- **Swipe oltre al tap**: uno swipe orizzontale per cambiare pagina, in aggiunta (non in sostituzione) al tap sui bordi già esistente — convive con il pinch-to-zoom
- **Vai al capitolo successivo a fine lettura**: arrivati all'ultima pagina di un capitolo, invito ad aprire il capitolo successivo del volume (se esiste)
- **Filtro luminosità/notte**: overlay scuro regolabile sopra le pagine, per lettura in ambienti poco illuminati

---

## Fase 25 — Organizzazione e scoperta

> Seconda fase del gruppo nato dall'analisi complessiva (vedi Fase 24). Tocca principalmente Catalogo e `db.js`.

- **Ricerca globale nella libreria**: oggi la ricerca nel Catalogo è limitata al livello corrente (solo tra le serie, o solo tra i volumi di una serie già aperta); una ricerca che attraversi l'intera libreria
- **Copertina personalizzata per Serie/Volume**: la Fase 22 ha tolto la copertina automatica da Serie e Volumi (livelli senza un'immagine propria); qui si dà all'utente la possibilità di assegnarne una manualmente (scegliendola tra le copertine dei capitoli contenuti, o caricandone una propria)
- **Tag/generi liberi sulle serie**: un campo libero per filtrare oltre ad alfabetico/ultimi letti
- **Segna tutto il volume come letto**: azione rapida per i volumi già letti altrove, senza aprire capitolo per capitolo

---

## Fase 26 — Rifiniture grafiche moderne

> Terza fase del gruppo nato dall'analisi complessiva (vedi Fase 24). Principalmente CSS/UX, nessuna nuova logica di dati. **Completata**: dettagli in [`docs/didattica/fase26-rifiniture-grafiche.md`](../didattica/fase26-rifiniture-grafiche.md). Il "pull-to-refresh" è stato sostituito da un pulsante esplicito "Ricontrolla i file" nell'intestazione della Libreria (il gesto sarebbe andato in conflitto con quello nativo del browser, che ricarica la pagina); il ricontrollo riporta come "non verificabili" i file di cui non si ha già il permesso di lettura.

- **Skeleton loading**: placeholder animati in stile Yomihon (dorso-libro) al posto dei testi "Caricamento…" in Catalogo/Libreria
- **Transizioni tra i livelli del Catalogo**: una transizione breve (slide laterale) nel passaggio Serie → Volumi → Capitoli, oggi istantaneo
- **Stato vuoto curato per Preferiti/In corso**: quelle sezioni oggi scompaiono del tutto se vuote (corretto per non essere invasive); per un utente nuovo, un piccolo invito illustrato alla prima apertura
- **Pull-to-refresh / ricontrollo file**: un modo rapido per far ricontrollare all'app lo stato dei file collegati (rimossi/spostati), senza aspettare che emerga aprendo un capitolo

---

## Fase 27 — Qualità

> Quarta e ultima fase del gruppo nato dall'analisi complessiva (vedi Fase 24). **Completata**: dettagli in [`docs/didattica/fase27-statistiche-rinomina.md`](../didattica/fase27-statistiche-rinomina.md). Il tempo di lettura è una stima (20 secondi a pagina), perché l'app non lo misura; la rinomina di un volume è il cambio del suo numero.

- **Statistiche di lettura**: pagine lette, tempo stimato, serie più lette — una nuova sezione in Impostazioni
- **Rinomina Serie/Volume**: oggi non esiste modo di correggere un titolo sbagliato se non rimuovendo e ricategorizzando

---

## Fase 28 — Nuovi formati di import

> Idea di Federico emersa durante la Fase 25: oltre a CBZ e CBR potrebbero arrivare file in altri formati. Divisa in due parti di costo molto diverso, da pianificare separatamente.

- **28a — Archivi generici (RAR, ZIP, 7z) — completata**: accettati anche `.zip`, `.rar`, `.7z`, `.cb7`; il lettore si sceglie dai primi byte del file (non dall'estensione), i worker di libarchive vengono chiusi dopo l'uso, timeout di 30 secondi sull'apertura, rilevamento dei file con password, e avvisi che nominano i formati non supportati (anche nelle cartelle, con una nota dedicata al PDF). Dettagli in [`docs/didattica/fase28a-nuovi-formati-archivio.md`](../didattica/fase28a-nuovi-formati-archivio.md)
- **28b — PDF — completata**: accettato anche `.pdf`, letto con pdf.js (caricata solo alla prima apertura di un PDF, con il suo worker nel precaching offline). Le pagine **non** si estraggono: sono "pigre" e si disegnano su canvas solo quando servono (con cache delle ultime 8 e precaricamento della successiva); in scroll continuo si caricano vicino alla vista e si rilasciano lontano; le doppie pagine si dividono come per gli archivi; la miniatura è la prima pagina. Limiti: niente PDF con password (rifiutati con il messaggio esistente, percorso non provato con un file cifrato vero), file letto interamente in memoria, tablet non misurato. Dettagli in [`docs/didattica/fase28b-lettura-pdf.md`](../didattica/fase28b-lettura-pdf.md). Corretto per strada anche un errore nel salvataggio del progresso passando da un capitolo all'altro dentro il Lettore

---

## Fase 29 — Barra, marchio, importazione e Lettore

> Nata dal feedback "troppo scolastico" dopo l'uso reale. Decisioni e motivazioni in [`docs/decisions/ADR-002-barra-di-navigazione-e-marchio.md`](../decisions/ADR-002-barra-di-navigazione-e-marchio.md).

**29a — Aspetto e navigazione**
- **Set di icone SVG** unico al posto delle emoji (Catalogo, sezioni di lettura, Preferiti, coda "Da categorizzare", avvisi)
- **Barra con marchio**: il nome "Manga Reader" come logo (predefinito *Sigillo*: 読 come timbro azzurro) e navigazione a icone in barra (predefinita); la barra continua a sparire al tocco in Lettura
- **Impostazioni → Aspetto**: scelta del marchio (Dorso / Sigillo / Blueline) e del menu (icone in barra / a tendina / laterale), salvate in locale; implementate tutte e tre le varianti di marchio e menu. La scelta della **pagina iniziale** (Automatica / Libreria / Lettore) si aggiunge in 29b, insieme al reindirizzamento: da sola non avrebbe alcun effetto finché il Lettore non ha la schermata "Continua a leggere"

**29b — Importazione, Lettore e Libreria**
- **Importazione**: icona "+" con tendina File / Cartella e formati accettati, al posto dei due pulsanti di testo
- **Lettore a vuoto**: "Continua a leggere", letti di recente e "Apri un file…"; il file aperto viene riconosciuto in libreria per nome (pagina, segnalibro, preferiti, statistiche ritrovati) oppure importato e aperto; estrazione della logica di import in un modulo condiviso con la Libreria
- **Libreria riordinata** (confermato): Catalogo con ricerca in cima, "Da categorizzare" come card, Preferiti sotto (la card compatta "Continua a leggere" prevista in origine è stata tolta con un fix: sta solo nel Lettore); "In corso di lettura" e "Ultimi letti" passano alla scheda Lettore
- **Pagina iniziale**: all'avvio, se esiste progresso di lettura, atterraggio sul Lettore (solo all'avvio e solo dalla radice, mai navigando dentro l'app né sui link diretti), con la relativa scelta in Impostazioni → Aspetto (Automatica / Libreria / Lettore, predefinita Automatica)

Verifica responsive di barra e tendine su tablet (orizzontale/verticale) e telefono: a cura di Federico su dispositivo reale.

---

## Fase 30 — Prestazioni con librerie grandi

> Pianificata dopo la 29b (che riordina la Libreria: conviene ottimizzare il caricamento dopo aver deciso come è fatta). Nata dalla domanda "cosa succede se carico molti manga?": misurata in sandbox popolando il database con dati sintetici e cronometrando le operazioni reali dell'app.

**Misure (desktop, dati sintetici; sul tablet atteso più lento, stima non misurata 3-6×):**

| | 1.500 capitoli (30 serie) | 9.000 capitoli (150 serie) |
|---|---|---|
| Spazio occupato | 29 MB | 172 MB |
| Apertura Libreria (query) | 0,2 s | 2,5 s |
| Tornare in Libreria fino al Catalogo disegnato | — | 2–3,4 s |
| Backup (JSON) | 34 MB | 203 MB, picco di memoria 643 MB |

Lo spazio non è un problema (i file non vengono copiati: ~19 KB per capitolo, solo riferimenti e miniature) e la lettura di un capitolo non dipende dalla dimensione della libreria. Peggiorano le operazioni che attraversano tutta la tabella dei capitoli e il backup.

**Divisa in due, entrambe completate:** la **30a** (database: indici, miniature a parte, ultima lettura sulla serie, schema Dexie v3) è completata e documentata in [`docs/didattica/fase30a-prestazioni-database.md`](../didattica/fase30a-prestazioni-database.md) (Libreria da 2–3,4 s a ~0,3 s a 9.000 capitoli); la **30b** (backup a pezzi, «leggero», ripristino a flusso) è in [`docs/didattica/fase30b-backup-scalabile.md`](../didattica/fase30b-backup-scalabile.md) (memoria di picco a 9.000 capitoli: da 643 MB a ~80 MB; non misurata su tablet, per scelta). "Libreria progressiva" si decide solo dopo aver rimisurato sul tablet.

**Cause e interventi, in ordine di resa:**
- **Miniature in una tabella a parte** *(30a, fatto)*: oggi ogni riga di `chapters` porta con sé il riferimento al file e la miniatura (~15 KB), e le scansioni complete ("Da categorizzare", Preferiti, ricerca globale: ~1 s ciascuna a 9.000 capitoli) le caricano tutte solo per filtrare un sì/no
- **Filtri indicizzabili** *(30a, fatto)*: `categorized` e `favorite` sono booleani, che IndexedDB non può usare come chiave; salvarli come 0/1 con indice (migrazione dello schema Dexie, con migrazione dei dati esistenti) o con una tabella dedicata
- **"In corso di lettura" e "ultima lettura per serie"** *(30a, fatto)*: oggi caricano tutti i progressi e i capitoli collegati ad ogni apertura; query indicizzate con interruzione anticipata, o l'ultima lettura memorizzata sulla serie
- **Libreria progressiva** *(da decidere dopo le misure su tablet)*: mostrare la pagina subito e riempire le sezioni mano a mano, invece di attendere la scansione iniziale ("Caricamento…")
- **Backup che regge le collezioni grandi** *(30b, fatto)*: oggi tutte le copertine finiscono in un'unica stringa JSON in memoria (203 MB e 643 MB di picco a 9.000 capitoli, probabilmente troppo per un tablet o un telefono); scrittura a pezzi del file, oppure un "backup leggero" senza copertine (si rigenerano aprendo i capitoli); da affrontare anche il ripristino, che oggi legge e interpreta il file intero
- Rifare le misure dopo ogni intervento con lo stesso metodo, per verificare il guadagno reale

---

## Fasi 33–36 — Note dai test su tablet (2026-10-05)

> Raccolte da Federico dopo aver provato le fasi 23-30 sul tablet. Esito dei test: **PDF caricato e visibile, menu corretti, CBR funzionante, categorizzazione multipla funzionante, statistiche visibili**. Le note sotto sono correzioni e nuove richieste, **non ancora iniziate**.
>
> **Ordine proposto**: 33 → 36 → **35 → 34** (la 35 crea la scheda Profilo che la 34 riempie). Tutte **prima della 31** (la guida interattiva descrive l'interfaccia: conviene scriverla quando ha smesso di cambiare); la **32 (IA) resta ultima**. I numeri sono d'ordine di elenco, non di esecuzione.

### Fase 33 — Correzioni e semplificazioni — completata

> **Completata**: dettagli in [`docs/didattica/fase33-correzioni-semplificazioni.md`](../didattica/fase33-correzioni-semplificazioni.md).

> Il banner "nessun preferito" della Libreria **non si sistema qui** (decisione di Federico): la card unica "Le mie serie" della Fase 34 lo sostituisce, mostrando sempre titolo e messaggio.

- **Preferiti: solo le serie.** Si potrà mettere tra i preferiti solo una serie, non volumi né capitoli (via le stelle da volumi e capitoli, via le sezioni "Volumi preferiti" e "Capitoli preferiti"). **Decisione di Federico**: i preferiti di volumi e capitoli già salvati vengono **ignorati** (non si cancellano né si migrano: i dati restano nel database e nei backup)
- **Bug preferiti**: se un preferito viene tolto dalla card dei preferiti, l'icona (stella) nella sezione Serie del Catalogo non si aggiorna. Causa probabile: la Libreria aggiorna i Preferiti quando cambia il Catalogo, ma non il contrario
- **Rimuovere la copertina personalizzata** per Serie e Volumi (selettore di copertina, `coverCustom`, anteprime nelle righe). **Decisione di Federico**: le copertine già scelte vengono **ignorate** (i dati restano nel database e nei backup)
- **Categorizzazione**: finita la categorizzazione, se non ci sono altri file da categorizzare, reindirizzamento alla Libreria (singola e multipla)
- **Categorizzazione: niente più informazioni ricavate dal nome del file** (decisione di Federico, vale per il **form singolo e per il multiplo**). Via la pre-compilazione introdotta dalla Fase 23: serie suggerita o nuova, volume e numero di capitolo. Tornano i campi vuoti con l'esempio scritto ("Es. One Piece", "Es. 1"). Restano il form multiplo (selezione, serie unica, "stesso volume per tutti", numero per riga) e il salvataggio in blocco. A implementazione: il parser dei nomi (`chapterNameParser.js`) resta inutilizzato per questo scopo; `normalizeTitle` serve ancora alla rinomina, il resto si può togliere; aggiornare il documento didattico della Fase 23
- **Lettore: il pulsante del cambio di direzione deve mostrare il suo stato.** Risposta di Federico: l'"overlay" è uno sfondo sul pulsante che renda evidente in ogni momento lo stato, premuto o no (come già fanno i pulsanti delle modalità di lettura e il filtro notte quando sono attivi). La direzione ha due stati e nessuno è "spento": proposta da confermare — sfondo sempre presente più una sigla (RTL / LTR) o l'icona che si inverte

### Fase 35 — Scheda Profilo: il guscio, le Impostazioni e le statistiche — completata

> **Completata**: dettagli in [`docs/didattica/fase35-scheda-profilo.md`](../didattica/fase35-scheda-profilo.md). Nuova versione 4 dello schema con la tabella `meta` (punto di partenza delle statistiche), inclusa nel backup; indirizzi `/profilo` e `/profilo/<sezione>`, con `/settings` che reindirizza.

> Si fa **prima della 34**: crea la scheda che la 34 riempie. Disegno concordato con Federico (2026-10-05).

- **La terza scheda diventa "Profilo"** (era "Impostazioni"), con l'icona di una persona nella barra. Dentro, in alto, un'**icona a chiave inglese** apre le impostazioni (Aspetto, Lingua, Backup e ripristino): sostituisce l'idea del burger. La pagina principale mostra le card (vedi 34), a partire dalle statistiche
- **Card Statistiche**: non cliccabile. In alto a destra un'icona apre una **finestra di conferma per il reset**
  - **Via il tempo stimato**
  - Si tiene traccia di **numero di serie, volumi, capitoli e pagine lette** (conteggi di libreria e di lettura); **via i capitoli finiti** (decisione di Federico). Serie, volumi e capitoli sono conteggi della libreria e non si azzerano
  - **Reset = solo i contatori di lettura** (le pagine lette), **il progresso resta invariato** ("Continua a leggere", "In corso", pagine raggiunte). Serve un **punto di partenza** salvato al reset (il valore del contatore in quel momento): si mostra la differenza tra il valore attuale e il punto di partenza, mai sotto zero. Salvato **nel database**, così viaggia nel backup
- Le pagine nuove sono **indirizzi veri** (per esempio `/profilo`), così il tasto indietro di Android funziona

### Fase 34 — Lista unica "Le mie serie" nel Profilo — completata (34a e 34b)

> **Completata** (34a e 34b): dettagli in [`docs/didattica/fase34-le-mie-serie.md`](../didattica/fase34-le-mie-serie.md). La 34b ha aggiunto il collegamento esplicito (suggerimento delle serie in libreria mentre si scrive il titolo, `seriesId` sulla voce, che regge alla rinomina), il ricollegamento per nome quando una serie viene reimportata, e l'avviso giallo dedicato per una serie collegata e poi rimossa. Il pulsante "Scollega" è stato tolto: il confronto per nome avrebbe ricollegato subito la voce.

> Disegno concordato con Federico (2026-10-05) e approvato su mockup interattivo: **una sola card con una sola lista**, gestita con filtri a chip, ricerca e ordinamento (scelta preferita alle quattro card separate Preferiti / In corso / Finiti / Da leggere). Dipende dalla 35 (la scheda Profilo) e dalla 33 (Preferiti solo serie).

**Scheda Profilo**: la card Statistiche (35) e la card **"Le mie serie"**.
- La card ha il titolo, **quattro chip con i contatori** (Preferiti, In corso, Finiti, Da leggere), **un solo chip selezionato alla volta**, e sotto **una riga di anteprima** dei titoli del chip scelto (3 sul telefono, 5 sul tablet: il CSS nasconde quelli che non entrano in una riga, senza media query)
- **Chip di partenza: Preferiti.** Il chip scelto è ricordato in locale da una visita all'altra
- La card è **sempre visibile**: se il chip scelto è vuoto mostra comunque il titolo e i chip, con un messaggio dentro (è anche la correzione del banner "nessun preferito" della 33)
- Niente chip "Tutti" (non comprenderebbe le serie in libreria mai iniziate né segnate e sembrerebbe una copia del Catalogo) e niente filtri combinabili, per ora

**Lista a pagina intera**: si apre toccando la card, già sul chip scelto, a un **indirizzo vero** (per esempio `/profilo/serie`) perché il tasto indietro di Android funzioni. Contiene i chip, la **ricerca** per titolo, l'**ordinamento** (ultima lettura, aggiunti di recente, alfabetico) e una matita per la modalità Modifica. Griglia di circa 3 colonne sul telefono, 6 sul tablet.

**Cosa significano i filtri** ("In corso" è la **lettura**, non lo stato di uscita del manga)
- **Preferiti**: serie con la stella. La stella è un'etichetta, non uno stato: un titolo può avere la stella senza essere né in corso né finito né da leggere, e allora compare solo sotto Preferiti
- **In corso**: serie in libreria con la lettura iniziata e non finita, **in automatico**
- **Finiti**: serie in libreria con tutti i capitoli letti, in automatico, **più** le voci manuali segnate "Letto" (manga letti altrove, per esempio su carta)
- **Da leggere**: solo voci **manuali**

**La stella, su ogni titolo**: si aggiunge e si toglie dalla lista nello stesso modo ovunque, come nel Catalogo (che si aggiorna: è anche la correzione del bug della stella, Fase 33). Solo le serie **in libreria** hanno la stella: una voce manuale non collegata a nessuna serie in libreria **non** ha la stella (i preferiti sono serie della libreria). Una voce manuale collegata a una serie in libreria sì.

**Cosa fa il tocco su un titolo, secondo il suo stato**
- **In corso**: finestra di conferma "Continuare la lettura di …?"; con "Continua" si va nel Lettore sull'ultimo capitolo letto di quella serie, alla pagina dove si era rimasti. Il pulsante "Continua" è il tocco che serve per chiedere il permesso di lettura sul file (come l'attuale "Riprendi")
- **Tutti gli altri** (Preferiti, Finiti, Da leggere): se il titolo è ancora in libreria, si va alla scheda **Libreria direttamente sulla serie** (serve un collegamento diretto che oggi non c'è); altrimenti un **avviso giallo** dice che il titolo non è più presente (serve un nuovo avviso di colore giallo)

**Aggiungere e togliere voci manuali: modalità "Modifica"**
- La matita attiva la modalità: compaiono la "x" sulle voci **manuali** (conferma di rimozione; le voci automatiche non si tolgono a mano) e una card "+" per aggiungere
- Il "+" apre una piccola finestra con **titolo**, **stato** (Da leggere / Letto) e **nota facoltativa**
- **Un titolo già presente nella lista è bloccato** con un messaggio, come per la rinomina delle serie (stesso confronto normalizzato, su tutta la lista)

**Dati**
- Nuova tabella `readingList` (nuova versione dello schema): titolo, stato, nota, `seriesId` facoltativo, date. Solo voci manuali: **non** si creano serie vuote nel Catalogo. In corso, Finiti automatici e Preferiti si ricavano dalla libreria
- **Backup**: la lista entra nel file e nel ripristino; un backup vecchio senza lista **non cancella** la lista già presente
- La tabella può ospitare anche il punto di partenza delle statistiche (35), per non fare due aggiornamenti di schema

**Dividere in due**
- **34a**: tabella, card e lista a pagina intera con chip/ricerca/ordinamento, stella (Preferiti spostati fuori dalla Libreria), collegamento diretto alla serie, In corso e Finiti automatici, finestra "Continua", modalità Modifica con aggiunta/rimozione di titoli liberi, avviso giallo
- **34b**: **collegamento con le serie in libreria**: mentre si scrive il titolo di una voce, l'app suggerisce le serie già in libreria e, se se ne sceglie una, la voce si collega a quella serie in modo sicuro (altrimenti, per un titolo libero, il collegamento si prova per nome). Una voce collegata e rimossa dalla libreria dà l'avviso giallo. Se una voce manuale non collegata corrisponde, per nome, a una serie importata in seguito, si collega e la stella diventa disponibile. Una voce "Da leggere" collegata a una serie su cui si è iniziato a leggere passa da sola in "In corso"

**Da sapere**: "In corso" per serie assomiglia a "In corso di lettura" della scheda Lettore, che è per capitolo. Convivono. Da tenere presente per la guida (31).

### Fase 36 — Schermo intero nel Lettore — completata

> **Completata**: dettagli in [`docs/didattica/fase36-schermo-intero.md`](../didattica/fase36-schermo-intero.md). Fullscreen API attivata dal tocco centrale (scelta in Impostazioni → Aspetto, attiva di default); il filo di avanzamento a controlli nascosti ha tre varianti selezionabili (visibile, trasparente di default, nascosto). La barra dell'app nascosta non lascia spazi vuoti: la striscia vista da Federico era la barra di stato di Android. **Non provabile in sandbox**: la prova vera resta sul tablet.

- **Parte alta dello schermo** (chiarito da Federico): la striscia che resta visibile in modalità a tutto schermo è quella che copre **data e ora di Android**, cioè la barra di stato di sistema. Il tocco centrale che nasconde i controlli e la barra dell'app c'è già ma non nasconde quella. Serve un vero schermo intero: Fullscreen API da un tocco nel Lettore (si esce con un gesto del sistema) oppure `display: fullscreen` nel manifest della PWA (vale per l'intera app). Da verificare anche se la barra dell'app nascosta lascia uno spazio vuoto nel layout
- **Barra in basso = il filo di avanzamento** del Lettore (risposta di Federico). In modalità a tutto schermo la vuole provare **trasparente oppure del tutto nascosta**: due varianti da provare sul tablet, eventualmente come scelta in Impostazioni
- Non verificabile in sandbox: va provato sul tablet, e il comportamento cambia tra browser e app installata

---

## Fasi 37–39 — Nuove note dai test su tablet (2026-10-06)

> Raccolte da Federico dopo aver verificato sul tablet tutte le fasi fino alla 36 (esito: tutto positivo). Domande chiarite e risposte concordate il 2026-10-06. **Non ancora iniziate.** Ordine: 37 → 38 → 39, tutte **prima della 31** (la guida descrive l'interfaccia, che deve smettere di cambiare); la **32 (IA) resta ultima**.

### Fase 37 — Lista "Le mie serie": serie sempre presenti e modifica più chiara — completata

> **Completata**: dettagli in [`docs/didattica/fase37-lista-rifiniture.md`](../didattica/fase37-lista-rifiniture.md). Il caso "preferita e in lettura solo sotto Preferiti" era stato segnalato come errore, poi **ritirato da Federico** (funziona): riprodotto in sandbox, compare sotto entrambi i chip. I suggerimenti di serie in libreria sotto il titolo del "+" (34b) sono stati tolti: ora le serie in libreria sono già tutte in lista, e il "+" serve per i titoli non in libreria.

- **"Da leggere" diventa lo stato di partenza di ogni serie in libreria**: una serie importata e mai aperta (nessun capitolo iniziato) ha lo stato derivato "Da leggere". Prima non aveva stato e non entrava nella lista, a meno di una stella. Conseguenza voluta: **tutte le serie in libreria compaiono nella lista**, ognuna in un chip tra In corso / Finiti / Da leggere (la stella resta un'etichetta a parte)
- **Precedenza degli stati**: lo stato calcolato dalla lettura (In corso, Finiti) vince sempre; "Da leggere" calcolato **cede** a uno stato manuale "Letto" (serie letta altrove ma mai aperta qui). Le voci manuali non in libreria restano come oggi
- **Il "+" sempre visibile** accanto al tasto Modifica (non più solo dentro la modalità Modifica). Resta la finestra con titolo, stato e nota
- **Modifica** (matita): su ogni titolo compaiono i controlli
  - voce manuale: come oggi, si modifica e si toglie
  - **serie in libreria**: si può **cambiare il titolo** (stessa rinomina del Catalogo, stessi controlli sui duplicati), la **nota** e lo **stato manuale** ("Da leggere" / "Letto", utile se letta altrove). La "x" **non cancella la serie dalla libreria**: toglie la **stella** e la voce manuale con la sua nota, e la serie resta in lista col suo stato di lettura. La conferma lo dice chiaramente
- **Popup dei preferiti**: un avviso breve in basso, non bloccante, che sparisce da solo ("Aggiunta ai preferiti" / "Rimossa dai preferiti"); per la rimozione c'è "Annulla". Vale ovunque ci sia la stella (Catalogo, lista). Un componente di avviso unico, riusabile
- Aggiornati i testi dei chip e il documento didattico della 34 (dove dicevano "Da leggere: solo voci manuali")

### Fase 38 — Importazione e categorizzazione più comode — completata

> **Completata**: dettagli in [`docs/didattica/fase38-import-categorizzazione.md`](../didattica/fase38-import-categorizzazione.md). Il mockup ha mostrato che la serie si sceglie da un menu a tendina (non si scrive): "l'ultimo titolo" è l'ultima **serie** usata; Federico ha scelto la **variante A** (riquadro tratteggiato sotto il menu, tocco o Tab). L'ultima serie si ricorda in locale (id, non entra nel backup) dopo ogni categorizzazione, singola o multipla.

- **Caricamento visibile nell'importazione massiva** di una cartella: basta un'**icona di caricamento** (decisione di Federico, niente barra con contatori) finché l'operazione non finisce, che impedisce di toccare altro; in fondo un messaggio con il **numero di file importati**
- **Categorizzazione multipla: suggerimento dell'ultimo titolo categorizzato**. Federico vuole **vederlo prima di decidere se gli piace**: a inizio fase si mostra un mockup. Idea di partenza: sotto il campo Titolo, un tocco rapido "Ultimo: One Piece"; con la tastiera fisica, **Tab** compila il campo con quel titolo (sul tablet senza tastiera resta il tocco). Solo per il titolo, non per gli altri campi
- **Categorizzazione multipla: via il pulsante "Categorizza" dalle singole righe** quando la lista ha più di un elemento; resta solo quello generale. Con **un solo elemento** nella lista il pulsante sulla riga resta
- **Numero del capitolo precompilato dal nome del file** (solo quello: il titolo e il volume restano senza suggerimenti, decisione della Fase 33). Si cerca prima un numero preceduto da "cap", "ch", "chapter", "c" o "#"; se non c'è, l'ultimo numero del nome, escludendo gli anni; se è ambiguo il campo resta vuoto. Vale per il form singolo e per ogni riga del multiplo, sempre modificabile. Da provare ("proviamo", Federico): si valuta sull'uso reale

### Fase 39 — Effetto "sfoglio" nel Lettore e pulsante "Torna alla libreria" — completata

> **Completata**: dettagli in [`docs/didattica/fase39-sfoglio-torna-libreria.md`](../didattica/fase39-sfoglio-torna-libreria.md). Tre scelte in Aspetto (Nessuno / Scorrimento / Libro, predefinito Libro); il pulsante "Torna alla Libreria" sta nel pannello dei controlli e porta alla Libreria. **Da provare sul tablet**: fluidità e aspetto reali del voltapagina.

- **Pulsante per tornare alla Libreria mentre si legge** (richiesta di Federico, 2026-10-06): oggi il Lettore non ha nessun pulsante per uscire (si usa la barra dell'app, che sparisce quando si nascondono i controlli, o il tasto indietro di Android). Da decidere a inizio fase: dove sta (barra dei controlli del Lettore), se torna alla Libreria o alla pagina da cui si è arrivati (Profilo, "Continua"), e che cosa succede in schermo intero

- Il cambio pagina, in **pagina singola e doppia**, mostra un **voltapagina 3D**: la pagina ruota sul dorso (a destra nel verso di lettura RTL, a sinistra nell'LTR), circa mezzo secondo. Non l'angolo che segue il dito: troppo complesso e rischioso per le prestazioni con immagini grandi e PDF
- **Impostazione in Aspetto** con tre scelte: **Nessuno**, **Scorrimento**, **Libro** (il predefinito si decide in implementazione; la scelta resta ricordata sul dispositivo). Rispetta `prefers-reduced-motion` (con il movimento ridotto si usa Nessuno)
- Da non rompere: precaricamento delle pagine, pagine PDF disegnate al volo, il salvataggio del progresso e le modalità a scorrimento verticale (dove l'effetto non si applica)
- Da provare sul tablet (fluidità): in sandbox si verifica solo che funzioni e non rompa il Lettore

---

## Fase 40 — Catalogo: serie a griglia con copertine

> Idea di Federico (2026-10-06), dopo aver provato le fasi 37-39. Concordata la forma: **griglia con copertine solo per il livello Serie** della Libreria; **Volumi e Capitoli restano ad elenco**. Non ancora iniziata. Va **prima della 31**: la guida interattiva deve descrivere l'interfaccia definitiva.

- **Serie a griglia**: le copertine ci sono già (`series.coverThumbnail`, la prima pagina del primo capitolo importato; le copertine personalizzate sono state tolte nella Fase 33). Griglia fluida come nella lista "Le mie serie" (circa 3 colonne sul telefono, 5-6 sul tablet), titolo su due righe con i puntini, segnaposto con l'iniziale colorata quando manca la copertina
- **La stella** sempre visibile in un angolo della copertina; **rinomina, tag e cestino** dietro una **modalità Modifica** (matita, come in "Le mie serie"), con le stesse conferme di oggi, per non avere icone piccole e facili da toccare per sbaglio. I **tag** (oggi sotto il titolo) vanno ripensati: da vedere su mockup prima di decidere
- Ricerca, ordinamento e filtro per tag restano come oggi
- **Da chiarire con Federico a inizio fase**: il livello **Capitoli** oggi è già una griglia con le copertine dei capitoli; "capitoli ad elenco" vuol dire passare a righe di testo (perdendo le miniature) oppure righe con una piccola miniatura a sinistra? Proposta: righe con miniatura
- Prima di scrivere codice: **mockup** (come per le Fasi 34 e 38)

---

## Fase 31 — Guida interattiva

> Nata dalla richiesta di un tutorial per chi usa l'app per la prima volta. Un video non si può generare qui, e invecchierebbe a ogni modifica dell'interfaccia: la guida vive dentro l'app, resta offline ed è bilingue (italiano/inglese).

- **Guida interattiva**: un breve giro a riquadri che indica le funzioni principali (importare con il "+", la barra di navigazione, la Libreria e la coda "Da categorizzare", il Lettore e le sue modalità, la scheda Profilo con la lista "Le mie serie", il backup nel menu della chiave inglese del Profilo)
- **Pulsante "Guida" (?)** nella barra di navigazione, in tutte e tre le varianti di menu (icone, tendina, laterale): è un aiuto, non una destinazione di uso quotidiano, quindi con un peso visivo diverso dalle tre schede
- **Primo avvio**: proposta della guida solo a chi apre l'app per la prima volta (segno salvato in locale) *e* ha la libreria vuota; chi ha già dei capitoli non se la vede imporre. Sempre saltabile, mai bloccante; rivedibile dal menu della chiave inglese del Profilo
- **Dati di prova** ammessi nel giro (decisione di Federico): generati dall'app, senza manga con diritti d'autore
- **Guida utente** leggibile con calma: pagina dedicata, aperta da un pulsante "Guida utente" nel menu della chiave inglese del Profilo (oltre al giro e al "?" nella barra)
- **Contenuto come dati, non scritto nel codice dei componenti** (sezioni e domande/risposte in file separati, in italiano e inglese): così la guida può essere aggiornata senza toccare l'interfaccia, e un giorno può diventare la base di conoscenza di un assistente IA che risponda alle domande dell'utente sull'app (idea da valutare insieme alla Fase 32, con la stessa gestione della chiave e il vincolo "solo online, su richiesta")
- Ordine deciso da Federico: la Fase 31 parte **dopo** aver concluso le fasi 33-36 (correzioni, schermo intero, scheda Profilo, lista unica) **e le 37-40** (rifiniture della lista, importazione, effetto sfoglio, Catalogo a griglia), così la guida descrive l'interfaccia definitiva

---

## Fase 32 — Riassunto "dove eravamo rimasti" con l'IA

> Ultima fase in elenco, da studiare a fondo a tempo debito (decisione di Federico). Funzione **opzionale e su richiesta**: l'app resta pienamente utilizzabile offline.

Punti già emersi nella discussione, da riprendere:
- **Chiave dell'API**: l'app è un sito statico senza server proprio; una chiave nel codice sarebbe leggibile da chiunque. Ipotesi preferita: chiave dell'utente inserita in Impostazioni e salvata solo sul dispositivo; alternativa, un piccolo server intermedio; da escludere un modello sul dispositivo (pesante e poco adatto alle pagine di un manga)
- **Cosa si riassume**: le pagine sono immagini, non testo, quindi serve un modello che le legga. Riassunto **per capitolo, una volta sola, salvato nel database**; "dove eravamo rimasti" come riassunto dei riassunti, a costo molto minore. **Mai oltre l'ultima pagina letta** (niente spoiler)
- **Costi e tempi**: da misurare con poche pagine prima di costruire; mostrare all'utente una stima prima di confermare
- **Pulsante visibile solo online**: i segnali del browser dicono se c'è una rete, non se c'è internet; si usano per mostrare il pulsante e al tocco si gestisce l'errore con un messaggio chiaro
- **Privacy e termini d'uso**: inviare pagine di manga a un servizio esterno è una scelta dell'utente; funzione spenta finché non inserisce la chiave
- Da decidere: cumulativo ("finora") o solo gli ultimi capitoli letti; lingua del riassunto; dove sta il pulsante (scheda Lettore, card di una serie)

---

## 🔮 Backlog futuro (fuori roadmap MVP)

- **Spesa totale in euro** (idea di Federico, parcheggiata per ora): dove inserire il prezzo (per volume o per serie), come sommarlo, mostrarla solo se compilata; riguarda i volumi posseduti, quindi la libreria, non la lista "Le mie serie"
- Migrazione a TypeScript
- Eventuale introduzione di una libreria di gestione stato più avanzata (es. Zustand), se necessario
- Test automatici (unit test)

---

*Ogni fase, una volta completata, avrà un file di documentazione dedicato in `/docs`, scritto in stile didattico.*
