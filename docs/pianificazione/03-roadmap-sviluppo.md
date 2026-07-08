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

## 🔮 Backlog futuro (fuori roadmap MVP)

- Riconoscimento automatico di pattern nei nomi file (raggruppamento automatico capitoli → volumi)
- Migrazione a TypeScript
- Statistiche di lettura
- Eventuale introduzione di una libreria di gestione stato più avanzata (es. Zustand), se necessario
- Test automatici (unit test)

---

*Ogni fase, una volta completata, avrà un file di documentazione dedicato in `/docs`, scritto in stile didattico.*
