# Fase 38 — Importazione e categorizzazione più comode

> Quattro ritocchi nati dall'uso sul tablet: sapere che l'app sta lavorando quando si importa una cartella intera, proporre l'ultima serie usata nella categorizzazione multipla, evitare un pulsante inutile sulle righe, e precompilare il numero del capitolo.

---

## 1. Un'attesa visibile durante l'importazione

Importare una cartella grande richiede tempo (si leggono i nomi, si controlla ogni archivio) e la pagina restava ferma, senza dire niente. Federico ha chiesto "un'icona di caricamento finta finché non finisce": finta nel senso che **non mostra quanto manca**, dice solo che l'app lavora. Niente barra di avanzamento, niente contatori.

- `BusyOverlay.jsx` + `BusyOverlay.css`: un velo a tutto schermo con un anello che gira, un titolo ("Importazione in corso…") e una riga ("Una cartella grande può richiedere qualche minuto. Lascia l'app aperta."). Sta sopra a tutto (z-index 300), così nel frattempo non si tocca altro. Con il movimento ridotto del sistema l'anello non gira: pulsa piano.
- In `Library.jsx` uno stato `importing` si accende quando i file sono scelti e si spegne in un blocco `finally` (anche se qualcosa va storto o si annulla il selettore: l'attesa non può restare accesa per sbaglio).
- **Una cartella si legge dentro il selettore**: `pickDirectory` prima chiede la cartella e poi la percorre. Il percorso è proprio la parte lenta, quindi `pickDirectory` accetta un'opzione `onPicked`, chiamata appena la cartella è scelta e *prima* di leggerla: lì si accende l'attesa. Per i file singoli basta accenderla dopo la scelta.
- **Il messaggio finale**: oltre alla riga con tutti i contatori, quando almeno un file è stato importato compare un avviso evidenziato: "N file importati."

## 2. Il numero del capitolo dal nome del file

Nella Fase 33 avevamo tolto **ogni** informazione ricavata dal nome del file (serie, volume, numero), perché i suggerimenti sbagliavano. Federico ora ne vuole riavere **uno solo**, il numero del capitolo, "proviamo". `src/chapterNumber.js` espone `guessChapterNumber(nomeFile)`, che nel dubbio **non suggerisce niente**: meglio un campo vuoto che un numero sbagliato.

Regole, in ordine:
1. si toglie l'estensione e ciò che sembra un numero e non lo è: risoluzioni (`1080p`), codec (`x264`), anni (`1995`, `2024`), volumi (`vol 3`, `volume 3`, `tome 3`, `v3`);
2. se c'è una parola chiave del capitolo (`cap`, `capitolo`, `ch`, `chapter`, `c`, `#`) seguita da un numero, vale quello. Il `c` da solo conta solo se non fa parte di un'altra parola, grazie a un *lookbehind* (`(?<![a-z])`);
3. altrimenti, se nel nome resta **un solo** numero, vale quello;
4. altrimenti (nessun numero, o più numeri e nessuna parola chiave) niente.

Il numero è normalizzato come lo scriverebbe una persona: `004` → `4`, `12,5` → `12.5`.

Provato su venti nomi (`One Piece - 004.cbz` → 4, `Bleach Vol 3 Ch 21.cbz` → 21, `Bleach Vol. 3.cbz` → vuoto perché è un volume, `One Piece 2 - 004.cbz` → vuoto perché ambiguo, `Slam Dunk 2024.cbz` → vuoto perché è un anno, ...).

Si usa nel form singolo e, per **ogni riga**, nel multiplo. Il campo resta modificabile e una nota sotto dice che il numero viene dal nome ("controllalo"): è un suggerimento, non un dato. Serie e volume restano vuoti.

## 3. Il pulsante "Categorizza" sulla riga

Con più file in lista, il pulsante su ogni riga e il pulsante "Categorizza…" della barra in basso facevano due strade diverse per la stessa cosa. Ora il pulsante sulla riga resta **solo quando c'è un file solo** nella lista. Con più file si seleziona (anche uno solo) e si usa la barra: il form multiplo funziona anche con un file ("Categorizza 1 capitolo").

## 4. L'ultima serie, suggerita (variante A)

Federico voleva vedere il suggerimento prima di decidere. Il mockup ha mostrato un fatto: nella categorizzazione la serie si sceglie da un **menu a tendina**, non si scrive. "L'ultimo titolo" è quindi **l'ultima serie in cui si è categorizzato qualcosa**. Tre varianti sul mockup (suggerimento sotto il campo, serie già scelta, testo fantasma); **Federico ha scelto la A**.

- Il menu parte vuoto e **mette il fuoco** sulla finestra aperta. Se esiste una "ultima serie" e c'è ancora, sotto il menu compare un riquadro tratteggiato: "Ultima serie usata: **One Piece**  TAB".
- Si accetta toccando il riquadro, oppure premendo **Tab** mentre il menu è ancora vuoto: la serie viene scelta e il fuoco resta sul menu. Il Tab successivo passa al campo dopo, come sempre; con Maiusc+Tab non si interviene. Non si sceglie mai al posto dell'utente.
- Su un tablet senza tastiera fisica resta il tocco: per questo il riquadro è un pulsante vero.
- **Si ricorda** in `lastSeries.js` l'id della serie (non il titolo: resiste a una rinomina), in `localStorage`, ogni volta che una categorizzazione, singola o multipla, va a buon fine. Se la serie non esiste più, nessun suggerimento. È una comodità del dispositivo, non un dato della libreria: non entra nel backup.
- Per la serie *nuova* (creata dal form multiplo) `categorizeChaptersBatch` già restituiva l'id: ora serve a ricordarla.

L'intercettare Tab è una scelta da usare con parsimonia (può disorientare chi naviga con la tastiera): qui scatta **una sola volta**, solo sul menu vuoto e solo se c'è un suggerimento.

## 5. Verifica (sandbox)

- importazione di quattro file di prova (cbz generati): l'attesa compare durante la lettura e sparisce alla fine; l'avviso "4 file importati" e la riga dei contatori sono corretti;
- nella coda non ci sono pulsanti sulle righe; "Seleziona tutti" + "Categorizza…" apre il form multiplo con i numeri precompilati (4, 5, 12,5) e **vuoto** per il nome ambiguo; nota "3 file precompilati";
- con un'ultima serie salvata il riquadro compare; **Tab** sceglie la serie, il riquadro sparisce, il fuoco resta sul menu;
- salvando, l'ultima serie ricordata diventa quella scelta e si torna alla Libreria (coda vuota);
- lint e build passano.

Non verificato: il tablet, e il comportamento dei selettori di file e cartella veri (in sandbox ho sostituito i selettori con file di prova).

## 6. Cosa si è imparato

- **Mostrare un'alternativa prima di costruirla** (il mockup) ha fatto emergere che la richiesta ("il testo con Tab") non corrispondeva a un menu a tendina: tre varianti hanno reso la scelta concreta.
- **Un'attesa va sempre spenta in un `finally`**: così non resta accesa se qualcosa va storto.
- **Un suggerimento automatico deve saper tacere**: nel dubbio il numero del capitolo resta vuoto.
- **Un'espressione regolare con lookbehind** (`(?<![a-z])`) distingue "c12" da "Lacci12": la stessa lettera, due significati.
