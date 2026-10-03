# Fase 30b — Un backup che regge le librerie grandi

> Seconda metà della Fase 30 (la 30a ha sistemato il database, vedi [fase30a](fase30a-prestazioni-database.md)). Qui si affronta l'ultimo punto della lista: il backup. A 9.000 capitoli produceva un unico JSON da ~200 MB con un picco di memoria di 643 MB, probabilmente troppo per un tablet o un telefono.

---

## 1. Il problema: "tutto in una stringa"

Il vecchio `exportBackup` faceva tre cose che a 9.000 capitoli diventano un muro:

1. leggeva **tutte** le tabelle in memoria;
2. convertiva **tutte** le miniature in data URL (testo base64, +33% rispetto al file originale);
3. faceva `JSON.stringify` di tutto in **un'unica stringa**, poi `new Blob([json])` la copiava ancora.

Il ripristino era lo specchio: `file.text()` (200 MB di stringa), `JSON.parse` (altri ~200 MB di oggetti), poi la conversione di ogni data URL. Il picco di memoria è la somma di tutte queste copie, non la dimensione del file.

L'idea della fase è una sola: **lavorare a blocchi, non tenere mai in memoria più di un blocco di capitoli.**

## 2. Il file diventa "a righe" (ma resta JSON)

Il formato è lo stesso JSON di prima, scritto con un ordine e degli a-capo precisi:

```
{"version":2,"layout":"lines","exportedAt":…,"light":false,"counts":{…},
"series":[…],
"volumes":[…],
"readingProgress":[…],
"chapters":[
{capitolo},
{capitolo}
]}
```

Perché funziona: gli spazi e gli a-capo tra gli elementi sono ammessi in JSON, quindi il file è **valido** sia per un lettore "a righe" sia per un normale `JSON.parse`. Le parti piccole (serie, volumi, progressi) stanno una per riga; i capitoli, che pesano ~20 KB l'uno per via della miniatura, hanno **una riga a testa**. L'intestazione dice quanti ne devono esserci (`counts`).

## 3. Esportare a pezzi: `exportBackupParts`

È un **generatore asincrono** (`async function*`): ogni `yield` produce un pezzo di testo e sospende la funzione finché chi la consuma non è pronto per il prossimo. Legge 200 capitoli alla volta (`BACKUP_BATCH`), converte le loro miniature, emette le righe e passa oltre; la memoria usata resta quella di un blocco, qualunque sia la libreria.

Chi riceve i pezzi (`backupFile.js`) li destina in due modi, a seconda del browser:

- **Dove esiste "Salva con nome"** (`showSaveFilePicker`, Chrome su computer): `createWritable()` e si scrive il file direttamente, un pezzo alla volta. Se qualcosa va storto si chiama `abort()`, altrimenti resterebbe un file a metà. Il selettore si apre **prima** di leggere il database: va richiesto durante il tocco dell'utente.
- **Altrove** (Chrome su Android, Firefox, Safari): un `Blob` costruito in modo incrementale, `blob = new Blob([blob, pezzo])`. Il browser non copia i dati, concatena i riferimenti, e può tenerli su disco invece che in RAM. Poi si scarica come prima, ma l'indirizzo temporaneo non si revoca subito: sui file grandi interromperebbe il download.

## 4. Backup completo o leggero

Le miniature dei capitoli sono quasi tutto il peso del file (a 9.000 capitoli: ~170 MB su ~178). In **Impostazioni → Backup** si sceglie:

- **Completo**: come sempre, con le miniature.
- **Leggero**: senza le miniature dei capitoli. Restano le copertine di serie e volumi. Le miniature dei capitoli si rigenerano da sole la prossima volta che il capitolo viene aperto (lo fa già il Lettore). A 9.000 capitoli: ~6 MB invece di ~178.

La scelta mostra **la dimensione stimata** (`estimateBackupSize`): somma le dimensioni dei `Blob` (la proprietà `size` non richiede di leggerli) più il 33% del base64, e ~300 byte per ogni riga di capitolo. È volutamente un po' per eccesso: a 9.000 capitoli stima 180 MB per un file da 178 MB.

## 5. Ripristino robusto

`restoreBackupFile(file, inspected)` lavora in due tempi:

- **`inspectBackupFile`**, alla scelta del file, legge solo la **prima riga** (dove sta l'intestazione) e permette di dire nella finestra di conferma "Il file contiene 150 serie, 900 volumi e 9000 capitoli", segnalando anche se è un backup leggero. Un file che non è "a righe" (un backup delle fasi precedenti) viene letto per intero con `JSON.parse`, come prima, e continua a funzionare. Un file illeggibile e un JSON che non è un backup danno due messaggi diversi.
- **Il ripristino vero** legge il file con `file.stream()` e `TextDecoderStream`, riga per riga, converte le miniature un capitolo alla volta e rilascia ciò che ha già convertito.

Una scelta di progetto: la lettura e la conversione (la parte lunga, quella che può fallire) avvengono **prima** della transazione che cancella e riscrive le tabelle. Se il file è danneggiato, o troncato, il ripristino fallisce con la libreria attuale intatta. Un file troncato esattamente a fine riga si leggerebbe senza errori ma incompleto: per questo, alla fine, si controlla che i capitoli letti siano quanti dichiara l'intestazione.

Un dettaglio che morde (e lo abbiamo trovato scrivendo il codice): in un `for await … break` il generatore viene **chiuso** all'uscita dal ciclo. Per leggere prima l'intestazione e poi i capitoli dallo stesso flusso di righe serve un iteratore manuale (`lines.next()`).

## 6. Avanzamento a schermo

Esportazione e ripristino mostrano "… 1200 / 9000 capitoli" (`onProgress`), e il pulsante di conferma del ripristino mostra l'avanzamento invece di restare fermo con "Ripristino…".

## 7. Risultati (desktop, 9.000 capitoli, dati sintetici)

| | Prima | Dopo |
|---|---|---|
| Esportazione completa: file | 203 MB | 178 MB (sintetico) |
| Esportazione completa: memoria JS al picco | 643 MB | **81 MB** (base 50 MB) |
| Esportazione completa: tempo | — | 5,3 s |
| Backup leggero | non esisteva | **6 MB**, 0,1–1 s |
| Ripristino completo: memoria JS al picco | stringa + oggetti, > 400 MB | **75 MB** |
| Ripristino completo: tempo | — | 14 s |

Verifiche funzionali: file valido anche per `JSON.parse`; ripristino del backup completo e di quello leggero (copertine di serie conservate, nessuna miniatura di capitolo); ripristino di un backup delle fasi precedenti; file illeggibile, JSON estraneo, riga corrotta e file troncato respinti **con la libreria intatta**.

Cosa **non** è stato misurato, con onestà: il tablet (si è deciso di procedere senza prova su dispositivo, quindi tempi e memoria reali lì sono ignoti); la memoria "nativa" dei Blob, che `performance.memory` non vede (i numeri sopra sono l'heap JavaScript: quello che prima esplodeva, ma non è tutto); il percorso "Blob + download" su Android, provato in sandbox solo intercettando il click sul link. Se sul tablet qualcosa fallisse, il **backup leggero** è la via d'uscita.

## 8. Cosa si è imparato

- **Il picco di memoria dipende dal numero di copie, non dal file.** Stringa, Blob, parse: ognuno raddoppia.
- **Generatori asincroni** (`async function*` + `for await`) sono lo strumento giusto per produrre o consumare dati "a pezzi" senza costruire una lista intera.
- **Un formato può restare compatibile cambiando solo il modo di scriverlo**: qui, il JSON è lo stesso, ma con gli a-capo giusti diventa leggibile a righe.
- **Fare prima il lavoro che può fallire, poi quello distruttivo.** Convertire tutto prima della transazione evita le librerie a metà.
- **Offrire una scelta onesta**: un backup leggero con la dimensione stimata accanto è più utile di un backup unico che può non riuscire.
