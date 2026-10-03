# ADR-002: Barra di navigazione, marchio, importazione e Lettore a vuoto

**Data:** 2026-10-03

**Contesto:**
Dopo il restyling "Yomihon" (ADR-001) e un uso reale dell'app, Federico ha segnalato che l'interfaccia resta "troppo scolastica" e poco simile a una vera applicazione moderna. I punti concreti emersi:

- i due pulsanti di testo "Importa file" / "Importa cartella" sono generici e occupano spazio sopra il Catalogo;
- la barra in alto è una riga di tre voci testuali, senza identità: non c'è il nome dell'app né un marchio;
- la scheda **Lettore**, aperta senza un capitolo, mostra un solo pulsante "Scegli file" rimasto della Fase 3. Un file aperto da lì viene letto "a vuoto": non viene cercato in libreria, non ripristina pagina, segnalibro e preferiti, non salva il progresso (quindi non entra nelle statistiche né in "In corso/Ultimi letti") e non genera la copertina;
- l'interfaccia mescola emoji (📖 🗑 🖼 🏷 📄 ⚠ ★) e icone SVG.

**Opzioni considerate:**
Esplorate con un mockup interattivo (strumento di discussione, non versionato), come per ADR-001.

- **Marchio** (il nome dell'app trattato come logo, non come semplice scritta): *Dorso* (un libro di taglio con 読), *Sigillo* (il carattere 読 come timbro azzurro leggermente ruotato, accanto al nome), *Blueline* (il nome con il filo blu delle tavole sotto).
- **Menu di navigazione**: *a tendina* sotto un burger, *laterale* (drawer), oppure *icone in barra* sempre visibili. Con sole tre destinazioni l'icona in barra costa un tocco in meno del burger; il burger lascia la barra più pulita e regge meglio nuove voci future.
- **Nome dell'app**: restare "Manga Reader" oppure adottare "Yomihon", il nome della direzione grafica.

**Decisione presa:**

- **Marchio predefinito: Sigillo.** Il nome resta **"Manga Reader"**: Yomihon rimane il nome della direzione grafica, non dell'app.
- **Menu predefinito: icone in barra** (libreria, lettore, impostazioni; quella attiva piena in azzurro).
- **Scelta dell'utente in Impostazioni**: il marchio (Dorso / Sigillo / Blueline) e il menu (icone in barra / a tendina / laterale) sono preferenze modificabili, salvate in locale sul dispositivo. Vanno quindi realizzate **tutte e tre** le varianti di entrambi, non solo quelle predefinite.
- **Importazione**: un'unica icona "+" con una tendina "File" / "Cartella" (con l'elenco dei formati accettati), al posto dei due pulsanti di testo.
- **Lettore a vuoto**: al posto del selettore singolo, "Continua a leggere" (ultimo capitolo, avanzamento, "Riprendi"), i letti di recente e "Apri un file…". Un file aperto da qui viene **cercato in libreria per nome**: se c'è, si apre quel capitolo con tutti i suoi dati (pagina, segnalibro, preferiti, statistiche); se non c'è, viene importato con le stesse regole dell'import dalla Libreria (validazione, duplicati) e poi aperto. Il percorso "file letto a vuoto" sparisce.
- **Ripartizione tra le schede**: la **Libreria** è ciò che si possiede (la card "Da categorizzare", solo quando c'è qualcosa; il **Catalogo** con ricerca e tag, in cima; i Preferiti sotto). Il **Lettore** è ciò che si sta leggendo ("Continua a leggere", "In corso di lettura", "Ultimi letti", "Apri un file…"). Motivo: il Catalogo e la sua ricerca erano la parte più usata ma finivano in fondo, dopo fino a cinque sezioni; e "In corso/Ultimi letti" duplicavano ciò che la scheda Lettore ora mostra.
  - *Aggiornamento (fix successivo)*: la prima versione teneva in Libreria anche una card compatta "Continua a leggere". Federico ha chiesto di toglierla (le stesse informazioni stanno già nel Lettore, dove si atterra all'avvio): oggi "Continua a leggere" vive solo nella scheda Lettore.
- **Pagina iniziale**: se l'utente ha già iniziato a leggere qualcosa, all'avvio dell'app si atterra sul **Lettore** (sulla schermata "Continua a leggere", non direttamente dentro il capitolo: il permesso di lettura sul file va richiesto durante un tocco, e "Riprendi" è quel tocco). Il reindirizzamento scatta **solo all'avvio** e solo se l'indirizzo è la radice, mai quando si naviga alla Libreria dall'app né sui link diretti (`/settings`, `/reader/12`). È una preferenza in Impostazioni → Aspetto: *Pagina iniziale: Automatica / Libreria / Lettore*, con "Automatica" predefinita. "Già iniziato" vuol dire che esiste almeno un elemento in "Continua a leggere".
- **Un solo set di icone SVG** con lo stesso tratto, al posto delle emoji.
- Restano invariati: la palette e i font Yomihon, gli eyebrow in giapponese come titolo di pagina, la barra che sparisce al tocco durante la lettura.
- **Responsive**: come per ADR-001, tablet in orizzontale e verticale come riferimento e telefono come caso da non penalizzare. Il progetto non ha `@media` query: la barra e le tendine seguono lo stesso approccio fluido già in uso (flex, dimensioni relative, `max-width`), da verificare su dispositivo reale.

**Conseguenze:**
- Nuovo componente per il marchio (tre varianti) e una piccola infrastruttura per le preferenze di interfaccia (marchio, menu) con persistenza locale; una nuova sezione "Aspetto" in Impostazioni, che sostituisce a tutti gli effetti il vecchio toggle del tema rimosso in Fase 21.
- La logica di import oggi dentro `Library.jsx` (`importHandles`) va estratta in un modulo condiviso, perché ora la usano sia la Libreria sia il Lettore.
- Si introduce un componente di icone SVG e si sostituiscono le emoji nell'interfaccia.
- File principalmente coinvolti: `src/App.jsx`/`App.css`, `src/pages/Library.jsx`/`.css`, `src/pages/Reader.jsx`, `src/pages/Settings.jsx`, i locali IT/EN, i componenti con emoji (`Catalog`, `ReadingSections`, `Favorites`, `Uncategorized`).
- Nessuna libreria nuova.
- Il lavoro è tracciato come Fase 29 in `03-roadmap-sviluppo.md`, divisa in due parti (29a e 29b) per tenere le PR revisionabili.
- La ripartizione tra Libreria e Lettore e la pagina iniziale richiedono una piccola lettura all'avvio (esiste progresso di lettura?) prima di decidere dove atterrare: un breve stato di attesa invece di mostrare la Libreria per un istante e poi cambiare schermata.
