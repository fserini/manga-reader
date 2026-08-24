# Fase 21 — Restyling grafico ("Yomihon")

> Documentazione didattica, scritta per chi non ha mai visto React prima. Fase fuori dalla roadmap MVP originale (si veda [`ADR-001`](../decisions/ADR-001-restyling-visivo-yomihon.md) per la decisione e le motivazioni): non aggiunge funzionalità, cambia solo *come* l'app si presenta.

---

## 🎯 Obiettivo della fase

Sostituire l'aspetto generico ereditato dal template Vite/React (nero/bianco, un solo accento ambra) con un'identità visiva pensata per l'app — palette scura fissa, tipografia dedicata, copertine e controlli di lettura ridisegnati.

---

## 🎨 Un solo aspetto, non due: perché i design token diventano più semplici

Dalla Fase 17 in poi, `index.css` gestiva **due** palette (chiara di default, scura via `prefers-color-scheme` o scelta esplicita) attraverso lo stesso meccanismo di variabili CSS visto in quella fase. La decisione di Yomihon (documentata nell'ADR) è di avere **un solo aspetto**, sempre scuro: questo significa che tutta l'impalcatura per gestire due palette — la media query, gli attributi `[data-theme]`, il Context React che ne teneva traccia — non serve più. È un caso concreto di un principio generale: **una funzionalità in meno da mantenere è una fonte in meno di bug**, se quella funzionalità non è più richiesta.

`index.css` ora dichiara i colori una volta sola, senza condizioni:

```css
:root {
  --bg: #050505;
  --text: #ece6d8;
  --accent: #5fb4de;
  /* ... */
}
```

E l'intera Fase 17 (`ThemeContext.jsx`, il selettore in Impostazioni) è stata rimossa — non semplicemente nascosta o disattivata, cancellata: codice che non serve più non va lasciato "per sicurezza", altrimenti si accumula come peso morto che chi legge il progetto in futuro deve comunque capire. La documentazione di quella fase resta (la lezione sulla Context API è ancora valida), con una nota che segnala la rimozione.

---

## ✍️ Tre font, tre ruoli

Fin qui il progetto usava un solo font di sistema per tutto. Yomihon introduce tre famiglie diverse, ciascuna con un compito preciso — caricate da Google Fonts direttamente in `index.html`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap"
  rel="stylesheet"
/>
```

- **Work Sans** — il testo dell'interfaccia (pulsanti, paragrafi, etichette): un font sans-serif pensato per essere letto a schermo, non per farsi notare.
- **Shippori Mincho** — un serif giapponese, per i titoli (`<h1>`, `<h2>`) e per il testo "in verticale" sulle copertine. Non è un font decorativo scelto a caso: nasce per accompagnare naturalmente caratteri giapponesi, il che lo rende adatto a un'app che tratta manga senza risultare posticcio quando compare accanto a un eyebrow come 蔵書 (vedi sotto).
- **JetBrains Mono** — solo per i numeri (percentuali, conteggio pagine): un font a **spaziatura fissa**, dove ogni carattere occupa la stessa larghezza. Comodo per le cifre perché "12/50" e "9/50" occupano lo spazio in modo prevedibile, senza che il testo attorno "balli" quando il numero cambia.

Tre variabili CSS (`--sans`, `--display`, `--mono`) rendono esplicito quale font usare dove, invece di ripetere il nome del font in ogni componente.

---

## 📚 Le copertine: un dorso, non un'icona

Prima di questa fase, un capitolo senza ancora una miniatura mostrava semplicemente un'emoji (📖) centrata. Ora il segnaposto è un **dorso di libro**: un pannello con una leggera sfumatura e il titolo scritto in verticale.

```jsx
function Cover({ blob, alt, title }) {
  // ...
  if (!url) {
    return (
      <div className="catalog-cover catalog-cover--placeholder" aria-hidden="true">
        <span className="catalog-cover-spine">{title}</span>
      </div>
    );
  }
  return <img className="catalog-cover" src={url} alt={alt} />;
}
```

Il dettaglio tecnico è tutto in una riga di CSS:

```css
.catalog-cover-spine {
  writing-mode: vertical-rl;
  font-family: var(--display);
}
```

`writing-mode: vertical-rl` dice al browser di disporre il testo in colonne verticali che scorrono da destra a sinistra — lo stesso principio usato per la scrittura giapponese verticale tradizionale, e qui preso in prestito per un effetto "dorso di libro" senza bisogno di ruotare manualmente il testo con `transform`.

Importante: questo trattamento riguarda **solo il segnaposto**. Una copertina vera (una miniatura reale, estratta dalla prima pagina) continua a mostrarsi come un'immagine normale — non ha senso "abbellire" una copertina che già mostra l'opera stessa.

---

## 📖 Il Lettore: cinque icone al posto di quattro controlli testuali

Qui il cambiamento è più profondo di un semplice restyling. Prima, la barra dei controlli mostrava sempre (quando visibile) quattro elementi testuali separati: tre pulsanti-pillola per la modalità, un pulsante per la direzione di lettura, un pulsante per il segnalibro. Ora sono **cinque icone** in un'unica barra flottante:

```jsx
<div className="reader-controls">
  <div className="reader-controls-group" role="group" aria-label={t('reader.modeGroupAria')}>
    {/* le 3 modalità, raggruppate e ravvicinate */}
  </div>
  <div className="reader-controls-divider" />
  <div className="reader-controls-group reader-controls-group--actions">
    {/* direzione di lettura + segnalibro, staccate dal gruppo modalità */}
  </div>
</div>
```

Il perché di questa scelta (discussa prima di scriverla, non decisa a tavolino da sola): un **gruppo di icone si estende meglio nel tempo** di un gruppo di tab testuali. Se in futuro serve un sesto controllo, è un'icona in più da aggiungere alla fila — non un gruppo intero da ridisegnare per fargli spazio. Le icone sono piccoli componenti SVG scritti a mano (`IconSingle`, `IconSpread`, `IconScroll`, `IconDirection`, `IconBookmark`), non un pacchetto esterno: cinque forme geometriche semplici (rettangoli, linee) non giustificano una dipendenza in più.

Un'icona da sola, però, non basta a un lettore di schermo per capire cosa fa un pulsante — per questo ogni icona porta con sé un `aria-label` con lo stesso testo che prima era visibile:

```jsx
<button aria-pressed={mode === value} aria-label={t(key)} onClick={...}>
  <Icon />
</button>
```

### Il filo di avanzamento: sempre visibile, non solo a comando

Prima, il contatore di pagina ("12 / 50") viveva nella stessa barra dei controlli: spariva insieme al resto quando si toccava lo schermo per nascondere l'interfaccia. Ora è **separato** e resta sempre visibile quando ci sono pagine da leggere:

```jsx
{pages.length > 0 && (
  <div className="reader-progress">
    <span className="reader-progress-count">{pageCounterLabel}</span>
    <div className="reader-progress-bar">
      <div className="reader-progress-fill" style={{ width: `${progressPercent}%` }} />
    </div>
  </div>
)}
```

È una striscia sottile (2px) con un numero minuscolo in monospace — pensata per essere talmente discreta da non richiedere di "nascondere l'interfaccia" per non vederla, perché non interrompe mai la lettura. La differenza tra "sempre visibile ma discreto" e "nascosto finché non lo richiami" è proprio il punto della direzione Yomihon per questa schermata: sapere sempre a che punto si è, senza dover interrompere la lettura per scoprirlo.

### Un compromesso dichiarato: niente pulsanti "pagina precedente/successiva" visibili

I vecchi pulsanti testuali "‹ Precedente" / "Successiva ›" sono stati rimossi dall'interfaccia visibile. La navigazione tra le pagine resta **completamente funzionante** tramite il tocco sui bordi dello schermo (introdotto già in Fase 6): toccare vicino al bordo sinistro o destro della pagina fa comunque avanzare o tornare indietro, la logica non è cambiata, solo la sua rappresentazione visiva.

Va detto con onestà: questa è una scelta di compromesso, non priva di costi. Chi naviga solo con tastiera, o chi non intuisce subito che i bordi della pagina sono toccabili, perde un punto di riferimento visivo esplicito. Non è stata aggiunta un'alternativa accessibile (es. pulsanti nascosti visivamente ma raggiungibili da tastiera) in questa fase: è segnalato qui come lavoro rimasto aperto, non come problema risolto.

### La barra dei controlli non si allarga all'infinito

```css
.reader-controls {
  max-width: 320px;
  margin: 0 auto;
}
```

Su un tablet in orizzontale, senza questo limite la barra si stirerebbe da un bordo all'altro dello schermo — con solo 5 icone al centro, diventerebbe un filo enorme di spazio vuoto. Lo stesso principio già usato per le pagine in modalità scroll (`max-width: 720px`, Fase 5): un contenuto non deve occupare tutto lo spazio disponibile solo perché lo spazio c'è.

---

## 🈂️ Un piccolo dettaglio giapponese, usato con parsimonia

Alcuni titoli di sezione (Catalogo, Impostazioni) sono preceduti da un carattere giapponese — 蔵書 (raccolta di libri) per il Catalogo, 設定 (impostazioni) per le Impostazioni:

```jsx
<div className="page-heading">
  <span className="page-eyebrow" aria-hidden="true">蔵書</span>
  <h2>{t('library.catalogHeading')}</h2>
</div>
```

`aria-hidden="true"` è importante qui: per chi usa uno screen reader, quel carattere non aggiunge informazione (il titolo vero, "Catalogo", è già presente e tradotto correttamente in `<h2>`) — è puramente un dettaglio visivo, e va dichiarato come tale esplicitamente, altrimenti uno screen reader proverebbe a leggerlo come se fosse contenuto significativo.

Deliberatamente, questo dettaglio non è stato applicato al Lettore: aggiungerlo lì avrebbe contraddetto l'obiettivo di quella schermata specifica, dove l'interfaccia deve ridursi al minimo, non aggiungere elementi decorativi.

---

## 🩹 Due ritocchi dopo il primo feedback sul dispositivo reale

Testata la fase su tablet, sono emersi due difetti non visibili in sandbox — corretti nello stesso branch di fix, non come nuova fase numerata (sono rifiniture della Fase 21, non una funzionalità nuova).

### L'alone blu al tocco

Chrome disegna di serie un rettangolo semitrasparente sopra qualunque elemento cliccabile quando lo si tocca — un residuo dello stile nativo del browser, quasi invisibile su desktop col mouse ma molto evidente su tablet. Si toglie con una riga in `index.css`:

```css
* {
  -webkit-tap-highlight-color: transparent;
}
```

### La barra di navigazione non si nascondeva in Lettura

Il tocco al centro dello schermo, in Lettura, nasconde da sempre i controlli *interni* del Lettore (Fase 6, poi il pannello a icone della Fase 21) — ma non la barra Libreria/Lettore/Impostazioni in cima, perché quella vive in `App.jsx`, un componente che non sapeva nulla di cosa succedesse dentro `Reader.jsx`. Serviva un canale tra i due — [`AppChromeContext.jsx`](../../src/AppChromeContext.jsx), una seconda applicazione della Context API dopo quella (ormai rimossa) della Fase 17, qui usata per uno scopo diverso: non condividere un *dato* (come il tema), ma inviare un *comando* ("nascondi la barra") da un componente profondo nell'albero a uno più in alto.

```jsx
// Reader.jsx
useEffect(() => {
  setChromeHidden(!interfaceVisible);
  return () => setChromeHidden(false);
}, [interfaceVisible, setChromeHidden]);
```

Il dettaglio che conta è il valore restituito dall'effetto (la funzione di **cleanup**): gira ogni volta che `interfaceVisible` cambia, ma soprattutto **quando il componente viene smontato** — cioè quando si esce dal Lettore per tornare alla Libreria. Senza quel `return () => setChromeHidden(false)`, uscire dal Lettore con l'interfaccia nascosta lascerebbe la barra sparita anche nelle altre schermate, perché lo stato "nascosta" resterebbe impostato per sempre.

---

## ✅ Come verificare che funzioni

Verificato nell'ambiente sandbox:
- Token di colore e font applicati correttamente (controllato via stili calcolati, non solo a occhio): `--bg`, `--accent`, font-family di corpo e titoli, i tre font effettivamente caricati (`document.fonts`).
- Catalogo: copertina segnaposto con sfumatura e testo verticale in Shippori Mincho, raggio degli angoli ridotto, proporzione 2:3.
- Impostazioni: sezione "Aspetto" rimossa, eyebrow 設定 presente, pillola attiva colorata con il nuovo accento.
- Lettore: struttura corretta nello stato senza capitolo caricato (selettore file, messaggio d'attesa); nessun riferimento residuo alle vecchie classi CSS (`reader-toolbar`, `mode-selector`, `reader-nav`, ecc.) in tutto il codice sorgente.
- `-webkit-tap-highlight-color` risulta `transparent` nello stile calcolato.
- `AppChromeContext`: la barra di navigazione resta corretta navigando Libreria → Lettore (senza capitolo) → Libreria, nessun errore in nessuno dei due sensi (verifica del montaggio/smontaggio dell'effetto, non del tocco per nasconderla — vedi sotto).
- `npm run lint` e `npm run build` puliti.
- Nessun errore in console in nessuno degli scenari sopra.

Non verificabile in sandbox (limite dell'ambiente):
- **La resa visiva reale delle pagine di un capitolo con file veri** (proporzioni, split automatico, il pannello controlli e il filo di avanzamento sovrapposti a un'immagine reale) — l'ambiente sandbox non permette di aprire un file tramite il picker nativo. Come da accordi, questa verifica la farai tu sul dispositivo reale.
- **Verifica responsive su più risoluzioni** (telefono, tablet verticale/orizzontale) — in particolare il comportamento della barra flottante dei controlli e del filo di avanzamento su schermi larghi.
- **Il tocco al centro che nasconde davvero tutto insieme** (controlli del Lettore + barra di navigazione), con pagine reali caricate — la correzione di `AppChromeContext` è verificata via codice e via montaggio/smontaggio della pagina, ma l'interazione di tocco vera e propria richiede un capitolo aperto con file reali.
- **L'alone blu al tocco**, sparito nello stile calcolato ma da confermare visivamente su un vero schermo touch (in sandbox non c'è un dito reale che tocca lo schermo).

## 🔎 Scoperto durante la fase, non risolto

- `public/favicon.svg` (l'icona reale usata dal browser e dalla PWA) non corrisponde affatto al concetto "libro" descritto in `src/assets/pwa-icon-source.svg`: è un logo completamente diverso, probabilmente un placeholder mai sostituito dalla Fase 2. Ridisegnare un'icona coerente con Yomihon è un lavoro di design a sé, non una modifica di codice — rimane da fare.
- **Categorizzazione di massa**: import di molti capitoli insieme (es. 20) richiede oggi di categorizzarli uno per uno in un dialog modale — funzionale ma pesante all'uso reale. Idee raccolte in conversazione (selezione multipla, numero capitolo dedotto dal nome file, raggruppamento automatico per pattern — quest'ultimo già nel backlog originale del progetto), nessuna ancora decisa/implementata.

---

## 🔜 Prossimi passi

Con questa fase l'identità visiva di base è impostata. Restano aperti, come lavoro futuro: l'icona dell'app, la verifica multi-schermo, e l'estensione dello stesso linguaggio grafico a componenti non ancora toccati direttamente (dialog, form) che però ereditano già i nuovi colori tramite le variabili CSS condivise.
