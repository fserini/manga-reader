# Fase 25 — Organizzazione e scoperta

> Seconda delle quattro fasi (24-27) nate dall'analisi complessiva dell'app. Con una libreria che cresce, trovare le cose e tenerle in ordine pesa più che leggerle: qui si lavora su Catalogo e `db.js`.

---

## 1. Ricerca globale

Prima, la ricerca nel Catalogo cercava solo nell'elenco del livello in cui ci si trovava (tra le serie, oppure tra i volumi di una serie già aperta). A **livello Serie** ora cerca in tutta la libreria:

- nel titolo e nei **tag** delle serie
- nei **capitoli** di tutta la libreria, confrontando la query con un testo composto da serie + volume + numero capitolo + nome del file (quindi "one piece capitolo 5" o "jjk_001" funzionano entrambi)

I risultati sono raggruppati in due sezioni ("Serie", "Capitoli"); toccare un capitolo lo apre direttamente nel Lettore, riusando `openChapter` (che chiede il permesso sull'handle durante il gesto, come sempre). I capitoli mostrati sono al massimo 50: oltre, l'elenco tornerebbe il "muro di righe" evitato in Fase 22, e si invita a restringere la ricerca.

Un dettaglio di prestazioni: l'elenco di tutti i capitoli (`getAllCategorizedChapters`) **non** si carica all'apertura del Catalogo, ma la prima volta che si scrive qualcosa nella ricerca (un `useEffect` guardato da `searchActive`), e viene invalidato (`setSearchableChapters(null)`) da `reloadCurrentLevel` dopo ogni modifica alla libreria. Chi non cerca mai non paga nulla.

A livello Volumi e Capitoli la ricerca resta quella di prima, limitata alla serie/volume aperti: lì il contesto è già stretto.

## 2. Tag liberi sulle serie

Un campo `tags` (array di stringhe) sulla riga della serie — nessuna migrazione di schema: i campi non indicizzati si aggiungono liberamente alle righe in Dexie, e il backup (Fase 16), che copia le righe per intero, li esporta già.

- **Modifica**: pulsante 🏷 sulla riga della serie → `TagsDialog`: chip con "✕", un campo per scriverne di nuovi (Invio o virgola, oppure il pulsante Aggiungi), e come scorciatoia i tag già usati altrove in libreria. Un duplicato "uguale ma con maiuscole diverse" (`Shonen` / `shonen`) viene scartato, e un tag scritto ma non ancora "aggiunto" non si perde al Salva.
- **Filtro**: sopra l'elenco, una riga di chip con tutti i tag in uso; toccarne uno filtra le serie, toccarlo di nuovo toglie il filtro. Uno alla volta, per restare semplice.
- **Ricerca**: la ricerca globale cerca anche nei tag.

`collectTags` unisce i tag di tutte le serie ignorando le maiuscole (vale la prima grafia incontrata), così "Shonen" su una serie e "shonen" su un'altra non diventano due filtri diversi.

## 3. Copertina personalizzata per Serie e Volume

In Fase 22 le copertine sono state tolte dai livelli Serie e Volume perché mostravano lo stesso segnaposto del Capitolo, rendendo i tre livelli indistinguibili. Qui si dà all'utente la possibilità di sceglierne una **apposta** — quindi compare solo dove l'utente l'ha voluta, e il Catalogo resta un indice testuale per tutto il resto.

Pulsante 🖼 su serie e volumi → `CoverPicker`: una griglia con le miniature dei capitoli contenuti (solo quelli già aperti almeno una volta, che hanno una miniatura), oppure **Carica un'immagine…**, che passa da `makeThumbnail` (la stessa funzione che ridimensiona le pagine dei capitoli) per non salvare immagini enormi nel database. "Torna alla copertina automatica" riporta la miniatura del primo capitolo.

La copertina si salva nel campo `coverThumbnail` che serie e volumi hanno già (quello della copertina automatica, già usato dai Preferiti e già gestito dal backup), più un flag `coverCustom: true`. È **quel flag** che decide se il Catalogo mostra la miniatura nella riga: senza flag, nessuna miniatura, come dopo la Fase 22. Un effetto collaterale utile: anche i Preferiti, che già mostravano `coverThumbnail`, mostrano la copertina scelta.

## 4. "Segna il volume come letto"

Il pulsante ✓ sul volume segna tutti i suoi capitoli come letti. Il punto è *dove* si tiene l'informazione:

- Il progresso di lettura (`readingProgress`) dice "pagina X di N". Un capitolo mai aperto non ha né pagina né N: non c'è nessuna riga da "completare". Inventarne una avrebbe richiesto un numero di pagine finto.
- E creare una riga di progresso per ogni capitolo avrebbe inondato "Ultimi letti" con un volume intero.

Per questo il segno vive sul **capitolo** (`markedRead: true`) e non tocca `readingProgress`. Un capitolo è "letto" se `markedRead` oppure se il suo progresso reale è completo (`isChapterDone` nel Catalogo). I capitoli segnati escono anche da "In corso di lettura" (`getInProgressChapters` li esclude), mentre un progresso reale già presente resta in "Ultimi letti": è comunque qualcosa che si è letto di recente.

Il gesto inverso ("non letto") **azzera anche il progresso reale** dei capitoli del volume — è l'unico modo di tornare davvero a "non letto" senza lasciare capitoli completati per davvero — e per questo chiede conferma.

## Un componente in più: `ConfirmDialog`

La conferma leggera (titolo, nota, Annulla/conferma) serviva ora due volte: la rimozione da "In corso/Ultimi letti" (Fase 24) e il "non letto" dei volumi. Con due usi identici ha senso condividerla: `ConfirmDialog` sostituisce il dialog che `ReadingSections` si era costruito da solo. `DeleteDialog` resta separato perché ha una cosa in più (la scelta sul file fisico) che qui non si applica.

## Cosa NON è cambiato

- Il Catalogo a livello Capitolo (griglia con copertine) e i livelli Serie/Volume come elenco testuale (Fase 22): le copertine personalizzate sono un'eccezione voluta, non un ritorno alla griglia.
- Lo schema Dexie: nessuna nuova versione, perché tag, `coverCustom` e `markedRead` sono campi non indicizzati.

## Verifica

Verificato in sandbox popolando IndexedDB (serie, volumi, capitoli con miniature generate su canvas, un progresso "in corso"):

- ricerca globale: per nome di serie, per tag, per numero di capitolo e per nome file; messaggio "nessun risultato" quando non trova nulla
- tag: aggiunta, duplicato case-insensitive scartato, suggerimento dei tag già usati, filtro a chip che si attiva e si toglie
- copertina: scelta fra i capitoli, caricamento di un'immagine propria, ritorno all'automatica; la miniatura compare sulla riga solo quando impostata
- "segna come letto": il volume passa da 0/2 a 2/2, i capitoli mostrano "✓ Letto", il capitolo esce da "In corso"; "non letto" chiede conferma, l'annullamento non cambia nulla, la conferma azzera anche il progresso

**Da verificare su dispositivo reale** (Federico, fuori sandbox): apertura di un capitolo dai risultati della ricerca globale (serve un vero handle di file), resa e ingombro delle quattro icone d'azione sulle righe delle serie su schermo stretto, caricamento di una copertina da galleria.
