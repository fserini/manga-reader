# Fase 39 — L'effetto "sfoglio" nel Lettore e il pulsante "Torna alla Libreria"

> Due richieste di Federico sul Lettore. La prima: il cambio pagina, in singola come in doppia pagina, deve **vedersi**, "come se fosse davvero un libro". La seconda: serve un pulsante per tornare alla Libreria mentre si legge.

---

## 1. Le tre scelte

Come concordato, in Impostazioni → Aspetto c'è una nuova scelta **Cambio pagina nel Lettore**:

- **Nessuno**: la pagina cambia di colpo, come prima;
- **Scorrimento**: la pagina vecchia esce di lato e la nuova entra dall'altro (280 ms);
- **Libro** (predefinito): la pagina si **volta** attorno al dorso, in 3D (520 ms).

Non si è fatto l'angolo che si arrotola seguendo il dito: sarebbe una funzione a sé, pesante, e rischiosa con immagini grandi e PDF. Con il movimento ridotto del sistema (`prefers-reduced-motion`) l'animazione non c'è, qualunque sia la scelta. In scroll verticale l'effetto non si applica (non ci sono "pagine" da voltare). La preferenza è `pageTurn` in `uiPreferences.js`, salvata in locale come le altre di aspetto.

## 2. Come si anima una pagina che sta cambiando

Il problema: quando React cambia pagina, la vecchia sparisce e la nuova compare **nello stesso istante**. Per animare un passaggio servono, per breve tempo, **tutte e due** a schermo.

- Nuovo stato `turn` = `{ dir: 'next' | 'prev', fromIndex, id }`, impostato da `turnPage()` quando si cambia pagina con un tocco o uno swipe; azzerato da un timer allo scadere dell'animazione (un timer e non l'evento `animationend`, che non scatta se la scheda è in secondo piano).
- `renderView(indice)` disegna la vista (una pagina o la doppia) che parte da un indice. Avere la vista in una funzione permette di disegnarne **due** insieme: quella di partenza e quella di arrivo. Ognuna ha una `key` legata all'indice, così nessuna si rimonta sopra l'altra.
- Tutta la parte di gesti e tocchi si è spostata su un **palco** (`.reader-stage`) che contiene le viste, una sopra l'altra (`position: absolute`). Prima ogni vista riceveva i gesti da sé.
- La pagina vecchia è sempre una pagina vera, non una "fotografia": per gli archivi basta l'immagine già caricata; per i PDF la pagina è già nella cache di `pdfPages.js`, quindi ridisegnarla costa poco.

### Scorrimento

Due viste: la vecchia (`--out`) e la nuova (`--in`), con due animazioni CSS opposte. La variabile `--slide-from` dice da che parte entra la nuova: in lettura da destra a sinistra, andando avanti, la pagina nuova arriva da sinistra; tornando indietro, il contrario.

### Libro

Qui c'è il "foglio" (`.reader-leaf`): una **copia** della pagina che gira, con un **davanti** (la pagina) e un **dietro** (la carta, un fondo scuro sfumato). Con `perspective` sul palco, `transform-style: preserve-3d` sul foglio e `backface-visibility: hidden` sulle facce, il browser mostra il davanti finché il foglio è sotto i 90° e il dietro oltre.

- **Avanti**: sotto resta la pagina *nuova*; sopra, il foglio è la pagina *vecchia* che si volta e se ne va.
- **Indietro**: sotto resta la pagina *vecchia*; il foglio è la pagina *nuova* che torna al suo posto (la stessa animazione, al contrario: `animation-direction: reverse`).
- **Singola pagina**: il foglio è tutta la pagina e il dorso è sul suo bordo (a destra in lettura RTL, a sinistra in LTR).
- **Doppia pagina**: il foglio è **una metà** e il dorso è al centro. La metà che gira è quella di sinistra in RTL e di destra in LTR. Il contenuto del foglio è la vista intera, larga il doppio del foglio e spostata di metà larghezza, così se ne vede la metà giusta. A fine corsa il foglio copre l'altra metà con il suo dietro: le sue facce sfumano negli ultimi istanti invece di sparire di colpo.
- **Il verso di rotazione** (`--leaf-angle`: +180° o −180°) si è ricavato dalla matrice di `rotateY` e confermato a occhio.

### Una trappola trovata provando

La prima versione sfumava il **foglio** intero (opacità). Ma un elemento con `opacity` minore di 1 *spiana* la scena 3D dei suoi figli: i due lati del foglio venivano disegnati sullo stesso piano e, a metà corsa, compariva il davanti **rovesciato** invece del dietro. Si sfumano quindi le **facce** (che non hanno altri figli 3D), non il foglio.

## 3. Il pulsante "Torna alla Libreria"

Nel pannello dei controlli del Lettore, a sinistra, un pulsante con l'icona della Libreria porta a `/`. Serve quando la barra dell'app è nascosta (tocco centrale e schermo intero): toccando al centro compaiono i controlli, e con essi il pulsante. Il progresso si salva comunque a ogni pagina, quindi uscire non perde nulla. Si è scelta la Libreria "semplice" e non la serie del capitolo: è quello che la richiesta diceva, e non c'è motivo di sorprendere.

## 4. Verifica (sandbox)

Con un capitolo di prova di 8 pagine numerate:
- **doppia pagina, RTL**: il foglio sinistro (pagina vecchia) arriva al dorso di taglio, passa sopra e copre la metà destra con il dietro, che sfuma;
- **singola pagina, RTL**: il foglio ruota attorno al bordo destro; avanti e indietro portano alla pagina giusta e, a fine animazione, il foglio sparisce;
- **LTR**: il foglio è quello destro, con origine a sinistra e −180°;
- **Scorrimento**: due viste con le classi `--out` e `--in`, `--slide-from` −100% in RTL avanti; **Nessuno**: nessuna classe di animazione;
- il pulsante "Torna alla Libreria" porta a `/`; nei 375 px il pannello controlli, con il pulsante in più, ci sta (nessun overflow);
- lint e build passano.

**Non verificato**, e importante: la **fluidità** e l'aspetto reale sul tablet (prospettiva, ombre, peso con immagini grandi). Il browser della sandbox, in emulazione telefono, ha dato schermate con riquadri duplicati: l'ho considerato un difetto dello strumento di cattura, ma solo il tablet lo conferma.

## 5. Cosa si è imparato

- **Per animare un cambiamento servono i due stati insieme**: prima e dopo. Tenere la vista vecchia a schermo per mezzo secondo è l'idea centrale.
- **3D in CSS**: `perspective` sul contenitore, `preserve-3d` sul foglio, `backface-visibility` sulle facce; e attenzione a ciò che "spiana" la scena (opacità, filtri, `overflow` sull'elemento 3D).
- **Un timer è più affidabile di `animationend`** quando serve garantire che qualcosa si pulisca.
- **Un'animazione si prova a fotogrammi**: mettere in pausa l'animazione a un istante preciso (`animation.currentTime`) ha permesso di vedere e correggere il difetto del dietro del foglio.
