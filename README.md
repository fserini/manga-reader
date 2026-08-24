# Manga Reader

Progressive Web App per leggere manga in formato **CBZ**/**CBR** su tablet Android, **100% offline**, sviluppata con **React** e **Vite**.

🔗 **App pubblica:** https://fserini.github.io/manga-reader/

Il progetto ha anche una finalità didattica: è stato costruito da zero per imparare React, in piccole fasi incrementali, ciascuna documentata in [`docs/didattica`](docs/didattica) in stile discorsivo (spiegata come a chi non ha mai visto codice frontend). Il percorso di pianificazione completo (analisi funzionale, tecnica, roadmap) è in [`docs/pianificazione`](docs/pianificazione).

## Funzionalità

- Libreria gerarchica Serie → Volumi → Capitoli, con import multiplo (file o cartella) e categorizzazione manuale
- Lettura CBZ/CBR con tre modalità (pagina singola, doppia pagina, scroll continuo), direzione LTR/RTL, zoom e split automatico delle doppie pagine
- Accesso diretto ai file sul dispositivo (File System Access API), senza duplicarne i byte nel database
- Progresso di lettura automatico e segnalibro manuale, preferiti, ricerca e ordinamento
- Gestione robusta di file/pagine corrotti
- Backup e ripristino dell'intera libreria su file
- Tema chiaro/scuro, interfaccia in italiano/inglese
- Installabile come app, funzionante offline, con notifica quando è disponibile una nuova versione

## Sviluppo locale

```bash
npm install
npm run dev
```

Richiede Chrome o Edge (anche su Android) per la File System Access API.

```bash
npm run build   # build di produzione (dist/)
npm run lint    # ESLint
```

## Stack tecnico

React, React Router, Vite, `vite-plugin-pwa`, Dexie.js (IndexedDB), JSZip, libarchive.js, i18next. Dettagli e motivazioni delle scelte in [`docs/pianificazione/02-analisi-tecnica.md`](docs/pianificazione/02-analisi-tecnica.md).

## Licenza

Codice pubblicamente visibile, tutti i diritti riservati — nessuna licenza d'uso concessa.
