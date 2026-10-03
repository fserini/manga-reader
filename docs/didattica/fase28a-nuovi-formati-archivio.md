# Fase 28a — Nuovi formati di archivio (ZIP, RAR, 7z)

> Prima metà della Fase 28 (la seconda, il PDF, ha un'altra pipeline ed è una fase a sé). L'app leggeva solo CBZ e CBR; qui accetta anche `ZIP`, `RAR`, `7z` e `CB7`, e soprattutto si comporta meglio quando un file non va.

---

## 1. Perché era "facile"

Un `.cbz` è uno ZIP con un altro nome, un `.cbr` è un RAR con un altro nome, un `.cb7` è un 7z con un altro nome. Dentro c'è sempre la stessa cosa: una cartella di immagini. Quindi una volta estratte le pagine il resto dell'app (Lettore, categorizzazione, Catalogo, statistiche) è **identico** per ogni formato: il formato non compare mai in nessuna schermata, e il layout non cambia di una riga. Tutto il lavoro è a monte: *riconoscere* il file, *leggerlo* senza sprechi e *spiegare* cosa non va quando non si può.

## 2. Un solo elenco di formati

In `fileAccess.js` c'è ora un unico elenco, `ARCHIVE_EXTENSIONS` (`cbz, cbr, zip, rar, 7z, cb7`). Da lì derivano:

- il filtro all'import (`isArchiveFileName`)
- l'attributo `accept` del selettore nel Lettore
- il testo "formati supportati" mostrato all'utente (`SUPPORTED_FORMATS_LABEL`, passato come parametro `{{formats}}` ai testi tradotti)

Prima "CBZ o CBR" era scritto a mano in quattro punti diversi (due lingue comprese): aggiungere un formato avrebbe significato ricordarsi di tutti.

## 3. Riconoscere dal contenuto, non dall'estensione

Il codice vecchio sceglieva il lettore dall'estensione: `.cbr` → libarchive, tutto il resto → JSZip. Ma le estensioni sbagliate sono comuni, e **il `.cbr` reale usato per i test era in realtà uno ZIP** (iniziava con `PK`). Con la regola vecchia finiva comunque nel lettore RAR/WASM, più lento e pesante, per niente.

Ora `detectReader` legge i primi byte (la "firma" del formato):

| Firma | Formato | Lettore |
|---|---|---|
| `50 4B` (`PK`) | ZIP | JSZip |
| `52 61 72 21 1A 07` (`Rar!`) | RAR | libarchive |
| `37 7A BC AF 27 1C` | 7z | libarchive |
| altro | — | si ripiega sull'estensione, come prima |

Il ripiego sull'estensione è voluto: la nuova regola può solo *aggiungere* file leggibili, mai toglierne uno che prima si leggeva. Un ZIP chiamato `.rar` e un RAR chiamato `.cbz` si aprono entrambi.

## 4. I worker che non si chiudevano

libarchive lavora in un Web Worker (un processo separato con dentro il suo modulo WASM). Il codice vecchio apriva un worker per ogni archivio e **non lo chiudeva mai**: importando 20 RAR si accumulavano 20 worker vivi, ognuno con un riferimento al file. Su un telefono è la strada più breve verso un'app che rallenta. Ora ogni apertura passa da `openLibarchive` e chi la usa chiama `archive.close()` in un `finally` (che scatta anche se qualcosa va storto a metà). Misurato: worker creati = worker chiusi, anche dopo tanti file.

## 5. Il timeout

Dalla correzione della Fase 20 (percorso del worker): se il worker non si carica, `Archive.open` **non fallisce, aspetta per sempre**. In Libreria questo bloccava l'intera importazione, in Lettura lasciava lo schermo fermo senza dire nulla. `openLibarchive` mette la richiesta in corsa (`Promise.race`) con un timer di 30 secondi: se vince il timer, parte un errore leggibile (`ArchiveError('timeout')`) invece dell'attesa infinita. Il timer copre solo l'*apertura* (avvio del worker e lettura dell'intestazione), **non** l'estrazione delle pagine, che su un volume grande può legittimamente durare di più.

## 6. Spiegare gli errori

`validateArchive` (che sostituisce `isValidArchive`) non risponde più solo "sì/no" ma dice *perché*: `ok`, `invalid` (non leggibile o senza immagini), `encrypted` (password), `timeout`. Ogni motivo ha il suo avviso in Libreria e il suo messaggio nel Lettore.

- **Password.** Per RAR e 7z lo dice libarchive (`hasEncryptedData`, che sa rispondere già dopo l'apertura). Per lo ZIP lo dice JSZip, ma *a parole* ("Encrypted zip are not supported"), non con un codice: `loadZip` riconosce quella frase e la trasforma in `encrypted`.
- **Formati non supportati.** Prima un file `.pdf` scelto dal selettore finiva solo nel contatore "Ignorati: N", e in un'importazione di **cartella** veniva saltato senza alcun segnale. Ora l'avviso nomina le estensioni trovate (`.pdf, .epub`, al massimo 4 poi `…`) e ricorda i formati accettati; per il PDF aggiunge "non è ancora supportato". Scandendo una cartella, però, certi file sono "rumore" normale (`cover.jpg`, `note.txt`, `.DS_Store`...): `IGNORED_IN_FOLDERS` li esclude dall'avviso, altrimenti ogni cartella con una copertina sciolta produrrebbe un falso allarme. Un file scelto a mano dal selettore, invece, è sempre segnalato.
- **Il riepilogo** dell'import ora dice "Non leggibili" e "Non supportati" (prima "Corrotti" e "Ignorati"), perché i motivi sono più di uno.

## Cosa NON è cambiato

- Il Lettore, la categorizzazione, il Catalogo, la logica di duplicati/ricollegamento in import: invariati. Cambiano solo i testi che nominavano "CBZ/CBR".
- La pipeline delle pagine (estrazione, spezzatura delle doppie pagine, miniatura).
- Il layout: nessun file di stile toccato.

## Verifica

In sandbox, con gli handle **veri** dell'OPFS del browser (`FileSystemFileHandle` reali, salvabili in IndexedDB) restituiti ai picker al posto della finestra di sistema, così l'import gira dall'interfaccia vera:

- file di prova **reali** (`.cbr` che è uno ZIP, 55 pagine; `.cbz`, 23 pagine) più archivi costruiti a mano: ZIP, **RAR4 "stored"** (costruito byte per byte, con la firma canonica di un RAR4), **7z "copy"**, RAR e ZIP con il bit di password, ZIP senza immagini, testo spacciato per archivio, finti PDF/EPUB/TXT/JPG
- import da file: 5 importati, 4 non supportati elencati (`.pdf, .epub, .txt, .jpg`, con la nota sul PDF), 2 non validi, 2 con password — ognuno con il suo avviso
- import da cartella: solo il `.pdf` segnalato; `cover.jpg`, `note.txt` e un file senza estensione ignorati in silenzio
- lettura dalla Libreria di RAR, 7z, ZIP, `.cbr` reale e `.cbz` reale
- messaggi del Lettore: archivio non valido (con l'estensione reale), password, nessuna immagine, timeout (provocato con un worker inesistente: 30 secondi esatti)
- worker creati e chiusi in pari

**Limiti, detti chiaramente:**
- RAR e 7z sono stati provati con archivi costruiti a mano, non con file creati da WinRAR/7-Zip. Il RAR è del formato **RAR4**; il **RAR5** non è stato provato. I RAR **multi-parte** (`.part1.rar`, `.r00`) non sono gestiti.
- Una cosa non cambiata ma ora più probabile da incontrare: l'estrazione carica **tutte** le pagine in memoria prima di mostrare la prima. RAR e ZIP "da volume intero" possono essere di centinaia di pagine; su telefono potrebbe pesare. Se sul dispositivo si vede, l'estrazione lazy diventa un lavoro a parte (e servirà comunque per il PDF).
- Aprendo un file dal selettore del Lettore (non dalla Libreria) non c'è un indicatore di caricamento: per un archivio grande lo schermo resta sull'invito iniziale finché non è pronto.

**Da verificare su dispositivo reale** (Federico, fuori sandbox): import di un vero `.rar`/`.7z` creato con i programmi normali (idealmente anche un RAR5), e il comportamento su telefono con un volume grande.
