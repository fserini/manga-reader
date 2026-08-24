# ADR-001: Accesso ai file — riferimenti esterni via File System Access API

**Data:** 2026-07-11

**Contesto:**
L'analisi tecnica (`docs/pianificazione/02-analisi-tecnica.md`) lasciava esplicitamente aperto il punto "Accesso ai file sul tablet", da approfondire in uno step dedicato prima di sviluppare l'import (Fase 8). Il nodo: dopo aver importato un CBZ/CBR, come fa l'app a **riaprirlo dopo un reload** senza chiedere di re-importarlo ogni volta? Fino alla Fase 7 il file veniva letto "una tantum" nel Lettore e tenuto solo in memoria.

Vincolo di piattaforma verificato: i picker della File System Access API (`showOpenFilePicker`/`showDirectoryPicker`) sono arrivati su **Chrome per Android solo da Chrome M132 (inizio 2025)** — prima non esistevano su Android, ed è questo il motivo per cui il punto era stato rimandato. Il target del progetto è Chrome su Android, quindi oggi l'API è disponibile.

**Opzioni considerate:**

1. **Riferimenti esterni (File System Access API).** Import via `showOpenFilePicker`/`showDirectoryPicker`; in IndexedDB si salva un `FileSystemFileHandle` (un puntatore al file originale), non i byte. Alla riapertura si ri-verifica il permesso e si rilegge il file dal disco.
   - *Pro:* nessuna duplicazione dei dati (una libreria manga può pesare vari GB); coerente con i requisiti dell'analisi funzionale della Fase 11 (rimozione automatica dei riferimenti a file spariti, eliminazione del file fisico dal dispositivo), che presuppongono file **esterni** all'app.
   - *Contro:* il permesso di lettura va riconfermato a ogni nuova sessione (mitigato quando la PWA è installata) e `requestPermission` funziona solo durante un gesto utente; alcune asperità note su Android (filtri estensione a volte ignorati, lentezza su cartelle molto grandi).

2. **Copia dei byte in IndexedDB (file picker classico).** Import via `<input type="file">`/`webkitdirectory`; si copiano i byte dell'archivio dentro IndexedDB.
   - *Pro:* più semplice, 100% offline senza ri-permessi, resiste a spostamento/cancellazione dell'originale.
   - *Contro:* duplica potenzialmente vari GB nel database (rischio quota sul tablet); rende **non applicabili** i requisiti Fase 11 "elimina file fisico" e "rimuovi riferimenti a file spariti" (l'app possiede una copia, non un riferimento).

**Decisione presa:**
Adottata l'**opzione 1 — riferimenti esterni via File System Access API**. L'app resta un *visore* sui file dell'utente: salva in IndexedDB solo l'handle. È la scelta coerente con l'intera visione funzionale del progetto (in particolare la Fase 11) ed evita la duplicazione di grandi quantità di dati.

**Conseguenze:**
- La tabella `chapters` (`src/db.js`) conserva un campo `handle` (il `FileSystemFileHandle`, serializzabile via structured clone e quindi salvabile nativamente in IndexedDB). Bump dello schema Dexie a `version(2)` con nuovo indice `fileName` per il rilevamento duplicati.
- Nuovo modulo `src/fileAccess.js` che isola i picker e la gestione permessi (`pickFiles`, `pickDirectory`, `verifyPermission`, `readFileFromHandle`, `isFileSystemAccessSupported`).
- Su browser non-Chromium (Firefox/Safari) l'import non è disponibile: la Libreria mostra un messaggio esplicito invece di fallire.
- Il permesso va richiesto durante un gesto utente e riconfermato a ogni sessione: verrà gestito nel collegamento Libreria→Lettore in Fase 10.
- Aggiornata la riga "Accesso ai file sul tablet" in `docs/pianificazione/02-analisi-tecnica.md`, da "da definire" a questa decisione.
