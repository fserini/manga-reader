# Fase 33 — Correzioni e semplificazioni

> Nata dalle note di Federico dopo aver provato sul tablet le fasi 23-30. Qui quasi tutto è **togliere**: meno funzioni, meno interfaccia, meno codice. Togliere è un lavoro vero: va fatto senza lasciare riferimenti orfani, e senza perdere i dati dell'utente.

> **Aggiornamento (Fase 38)**: del nome del file si usa di nuovo **solo il numero del capitolo** (precompilato e modificabile, nel dubbio vuoto); serie e volume restano senza suggerimenti. Vedi [`fase38-import-categorizzazione.md`](fase38-import-categorizzazione.md).

---

## 1. Principio: togliere una funzione non vuol dire cancellare i dati

Tre funzioni escono dall'interfaccia: i preferiti di volumi e capitoli, la copertina personalizzata e la pre-compilazione dal nome del file. Per le prime due **i dati restano** nel database e nei backup. Perché:

- cancellarli con una migrazione sarebbe un'operazione irreversibile su dati dell'utente, per un guadagno nullo (un campo in più in una riga non pesa);
- se un giorno servissero ancora, ci sono;
- un backup vecchio o nuovo contiene gli stessi campi, quindi ripristinare non rompe niente.

Il campo viene semplicemente **ignorato**: nessuna schermata lo legge più. È una scelta di Federico, ed è la più prudente.

Una conseguenza da sapere: la copertina scelta a mano stava nello stesso campo (`coverThumbnail`) della copertina automatica, quindi una serie che l'aveva scelta potrebbe continuare a mostrarla nella card dei preferiti. Non si può distinguere senza il flag `coverCustom`, e leggerlo solo per questo avrebbe tenuto in vita la funzione che si voleva togliere.

## 2. Preferiti solo per le serie

- Via la stella dalle righe dei **volumi** e dalle card dei **capitoli**.
- `Favorites.jsx` è stato riscritto: mostra solo le serie. Spariscono le sezioni "Volumi preferiti" e "Capitoli preferiti", la logica per aprire un capitolo da lì (permesso, file non più presente) e gli avvisi collegati.
- Dal database sono uscite `toggleVolumeFavorite`, `toggleChapterFavorite`, `getFavoriteVolumes`, `getFavoriteChapters`; e dalle traduzioni le frasi che le servivano.

## 3. Il bug della stella che non si aggiorna

Se si toglieva un preferito dalla **card dei preferiti**, la stella nella lista **Serie** del Catalogo restava accesa. La causa è nella struttura: Catalogo e Preferiti sono due componenti **fratelli** dentro la Libreria, ognuno con i suoi dati caricati. Il Catalogo avvisava già la Libreria quando cambiava un preferito (e la Libreria faceva ricaricare i Preferiti), ma **non c'era il percorso inverso**.

Si poteva rimontare il Catalogo cambiandogli la `key`, ma si sarebbe perso il livello in cui l'utente si trovava (Serie, Volumi o Capitoli). Si è fatto così:

- `Favorites` chiama una nuova callback `onChanged` quando si toglie un preferito;
- la Libreria incrementa un contatore (`favoritesRevision`) e lo passa al Catalogo come proprietà;
- il Catalogo ha un effetto che dipende da quel contatore e **ricarica solo le serie**, senza rimontarsi. Il valore iniziale (0) si salta: lo copre già il caricamento di partenza.

È lo schema "stato condiviso salito al genitore" visto più volte in React: quando due fratelli devono restare allineati, il genitore tiene il numero che dice "è cambiato qualcosa".

## 4. Copertina personalizzata: via

Esce il pulsante "cambia copertina" su serie e volumi, la finestra `CoverPicker` (file e stile cancellati), le miniature `RowThumb` accanto ai titoli, le funzioni `setCustomCover` e `clearCustomCover`, e le regole CSS e le traduzioni collegate. Il codice morto non è "innocuo": va tolto, altrimenti chi lo legge in futuro deve capire se serve ancora.

## 5. Categorizzazione: niente più informazioni dal nome del file

Federico non voleva che titolo, volume e capitolo venissero ricavati dal nome del file (la pre-compilazione della Fase 23): campi vuoti con l'esempio scritto ("Es. One Piece", "Es. 1"), **nel form singolo e nel multiplo**. Di conseguenza il parser dei nomi (`chapterNameParser.js`) non serve più, ed è stato cancellato; l'unica funzione ancora utile, `normalizeTitle` (il confronto tra titoli che ignora maiuscole, accenti e punteggiatura, usato dalla rinomina), è passata in un file suo, `titles.js`.

Restano il form multiplo, la serie unica, "stesso volume per tutti", il numero per riga e il salvataggio in blocco (una transazione).

## 6. Dopo la categorizzazione, si torna in Libreria

Finita una categorizzazione, se la coda "Da categorizzare" è vuota, `Uncategorized` naviga alla Libreria (`navigate('/')`). Se restano file, si resta. `refresh` ora **restituisce quanti ne restano**, e una funzione `refreshAfterCategorizing` decide: valeva anche per la categorizzazione multipla. La rimozione di un file dalla coda (il cestino) non reindirizza: l'utente non sta categorizzando.

## 7. Il pulsante della direzione di lettura

Il pulsante RTL/LTR non mostrava il suo stato: a differenza delle modalità di lettura e del filtro notte (che hanno uno sfondo quando sono attivi), la direzione ha **due** stati e nessuno è "spento", quindi la logica "sfondo = attivo" non basta. Ora il pulsante ha **sempre** uno sfondo azzurro tenue e una **sigla** (RTL / LTR) accanto all'icona: leggendo la sigla si sa quale direzione è attiva, senza dover premere.

## 8. Verifica

In sandbox:

- **Categorizzazione**: form singolo e multiplo aperti su file con nomi "parlanti" (`One Piece v01 c001.cbz`, `Berserk 042.cbz`): nessun campo pre-compilato, nessun avviso, solo i segnaposto. Categorizzato un gruppo con il form multiplo (si resta nella coda con un file rimasto), poi l'ultimo con il form singolo: **reindirizzamento alla Libreria**.
- **Preferiti**: con volumi e capitoli ancora segnati come preferiti nel database, la Libreria **non** mostra le loro sezioni; nessuna stella su volumi e capitoli, nessun pulsante copertina. Stella su una serie → compare nella sezione Preferiti; toglierla dalla card → la stella nel Catalogo si spegne **senza ricaricare** e senza uscire dal livello.
- **Direzione di lettura**: il pulsante ha lo sfondo e la sigla sia in RTL sia in LTR, e cambia al tocco.
- Lint e build passano.

Cosa **non** è stato verificato: il tablet; la risposta al tocco sulla sigla in orizzontale e in verticale (il pulsante è un po' più largo di prima: 30 px di altezza, larghezza in più per la sigla).

## 9. Cosa si è imparato

- **Togliere una funzione**: interfaccia, stato, funzioni del database, traduzioni, stili e file, tutto insieme; ma **non i dati dell'utente**.
- **Due fratelli che devono restare allineati** si parlano tramite il genitore: un contatore che sale è un modo semplice per dire "ricaricati".
- **Un'etichetta di stato** può avere due stati senza uno "spento": in quel caso lo stato va **mostrato**, non solo evidenziato quando è "acceso".
