# ADR-001: Restyling visivo — direzione "Yomihon"

**Data:** 2026-08-24

**Contesto:**
Con la Fase 20 si è chiusa la roadmap MVP (analisi, stack, 21 fasi di sviluppo, deploy pubblico su GitHub Pages). L'aspetto grafico dell'app, però, non è mai stato oggetto di una decisione deliberata: è quello via via emerso fase per fase, basato sullo stile "blando" del template Vite/React di partenza (nero/bianco generico, un solo accento ambra, `system-ui`), senza un'identità visiva pensata per il prodotto specifico (un lettore di manga). Prima di continuare a costruire su questa base, si è deciso di affrontare esplicitamente un restyling.

**Opzioni considerate:**

Sono state esplorate due direzioni visive di partenza, entrambe scelte per essere radicate nel medium (manga come oggetto fisico/di produzione), non nella tavolozza generica di un'app qualunque:

- **"Bookshelf"** — inchiostro caldo, oro antico, copertine trattate come dorsi rilegati su una mensola (testo verticale, serif giapponese Shippori Mincho per i titoli), azioni visibili solo al passaggio del mouse. Adatta alla Libreria/Catalogo, ma giudicata troppo ornata per la schermata di Lettura, dove l'obiettivo è l'esatto opposto (l'interfaccia deve sparire).
- **"Blueline"** — nero pieno da lettura OLED, filetti come i margini tra le vignette, tipografia condensata tecnica, dati in monospace. Una prima versione usava un accento rosso ("timbro hanko"), scartato perché troppo vicino a un cliché ricorrente nel design generato ("nero quasi pieno + un unico accento acceso") — sostituito con un azzurro ispirato al blueline/screentone della produzione manga, scelta più specifica e meno generica.

**Decisione presa:**

Sintesi delle due, chiamata **"Yomihon"**:
- **Palette da Blueline**: nero pieno (`#050505`), un solo accento blu (blueline, non il rosso della prima bozza), superfici quasi nere con una lieve virata calda nel testo secondario (ponte verso il carattere di Bookshelf).
- **Grammatica grafica da Bookshelf**: copertine verticali 2:3 con titolo in verticale stile dorso, titoli/intestazioni in Shippori Mincho, testo corpo in Work Sans, eyebrow in giapponese per ogni sezione (蔵書 Catalogo, 頁 Lettura, 設定 Impostazioni), dati numerici (percentuali, conteggio pagine) in JetBrains Mono.
- **Schermata di Lettura, trattamento specifico**: niente fila di tab/pillole sempre visibili. Interfaccia quasi del tutto assente durante la lettura (solo un filo di avanzamento sul bordo e un numero minuscolo in monospace in un angolo); i controlli emergono **solo al tocco**, come una barra flottante di **5 icone** (non testo): le 3 modalità di lettura raggruppate e ravvicinate (quella attiva piena in blu), un piccolo distacco, poi direzione di lettura e segnalibro come icone indipendenti. Motivazione: un gruppo di icone si estende meglio nel tempo di un gruppo di tab testuali — un nuovo controllo futuro è un'icona in più, non un gruppo da ridisegnare. La barra è staccata da tutti e quattro i lati dello schermo, angoli arrotondati uniformi, dimensionata in modo compatto (non deve dominare la schermata).
- **Responsive fin dall'inizio, su tutta la grafica**, non solo dove già presente: si estende la stessa impostazione già in uso nel codice attuale (griglia a colonne fluide via `auto-fill`/`minmax`, `object-fit` per le immagini, `flex-wrap`, dimensioni relative) anche ai nuovi elementi introdotti da questa direzione — in particolare la barra flottante dei controlli e il filo di avanzamento in Lettura, che vanno verificati esplicitamente su schermi larghi/tablet in orizzontale (probabile necessità di un `max-width` centrato, sullo stesso principio già usato per le pagine in modalità scroll).
- **Fuori scope**: la resa delle pagine manga vere e proprie (proporzioni, split automatico delle doppie pagine) non cambia per effetto di questa decisione — resta una verifica che Federico farà direttamente sul dispositivo reale con file reali, non riproducibile fedelmente in sandbox.

Esplorata iterativamente tramite mockup (un Artifact di lavoro, non versionato nel repository — strumento di discussione, non deliverable) prima di arrivare alla sintesi qui descritta.

**Conseguenze:**
- Nuovi design token da introdurre (probabilmente in `src/index.css`, sostituendo l'attuale coppia di palette chiara/scura): colori Yomihon, caricamento dei font Google Shippori Mincho / Work Sans / JetBrains Mono.
- File coinvolti nella prima fase di implementazione: `src/index.css`, `src/components/Catalog.css`/`.jsx`, `src/pages/Reader.css`/`.jsx`, `src/pages/Settings.css`/`.jsx`.
- Nessun impatto sullo stack tecnico descritto in `02-analisi-tecnica.md`: nessuna libreria nuova, solo font via Google Fonts e icone SVG inline.
- Il lavoro viene tracciato come nuova fase in `03-roadmap-sviluppo.md` (Fase 21), dato che la roadmap MVP è chiusa e questo è lavoro nuovo già deciso, non un'idea da valutare in backlog.
