# Fase 26 — Rifiniture grafiche

> Terza fase del gruppo nato dall'analisi complessiva (vedi la [Fase 24](fase24-comfort-lettura.md)). Quasi tutta CSS e UX; l'unica parte con logica nuova è il ricontrollo dei file. Il filo comune: **l'app deve dire che cosa sta succedendo** (carico, cambio livello, non c'è ancora nulla, un file non c'è più).

---

## 1. Skeleton: la forma prima del contenuto

Al posto di "Caricamento…" ci sono ora **segnaposto animati** (`Skeleton.jsx`): righe che hanno già la forma delle righe vere, con il loro "dorso" azzurro a sinistra (come nel marchio dell'app) e un riflesso che scorre. Usati in Libreria (titolo + sei righe), Catalogo e coda "Da categorizzare".

Perché è meglio del testo: la pagina **non salta** quando i dati arrivano, perché lo spazio è già occupato da qualcosa della stessa forma.

Tre dettagli:

- Il riflesso è un `linear-gradient` più largo del riquadro (`background-size: 400% 100%`) di cui si anima la **posizione**: nessun elemento si muove, quindi è economico per il browser.
- I riquadri sono `aria-hidden` (decorativi), ma il contenitore ha `role="status"` e un'etichetta ("Caricamento…"): uno screen reader sa comunque che si sta caricando.
- `@media (prefers-reduced-motion: reduce)` li ferma per chi ha chiesto meno movimento al sistema. È l'unico uso di una media query in tutta l'app: non riguarda il *layout* (che resta fluido) ma una preferenza di accessibilità.

Il Lettore mantiene il suo "Caricamento del capitolo…": è a schermo intero e di durata breve, un segnaposto lì non aggiungeva nulla.

## 2. Transizione tra i livelli del Catalogo

Passando da Serie a Volumi a Capitoli, il contenuto scivola lateralmente (0,22 s): da destra scendendo, da sinistra risalendo. Come funziona:

- Tutto ciò che cambia con il livello sta in un contenitore con `key={level}`: React, vedendo una `key` diversa, **smonta e rimonta** il contenitore, e l'animazione CSS d'ingresso (`catalog-slide-forward` / `catalog-slide-back`) riparte da capo.
- Il verso (`direction`) si decide nei punti in cui si naviga (`openSeries`, `openVolume`, `goToSeries`, `goToVolumes`). Prima della prima navigazione è `null`: all'apertura del Catalogo non si anima niente.
- I **dialog restano fuori** dal contenitore. Un elemento con `transform` (anche solo durante un'animazione) diventa il riferimento per i discendenti con `position: fixed`: un dialog dentro verrebbe posizionato rispetto al contenitore e non allo schermo.

## 3. Stati vuoti curati

`EmptyState.jsx` è un componente unico, in due forme: grande (icona in un cerchio, titolo, testo, azione) e **compatta** (da riga, con una "x" per chiuderla).

- **Scheda Lettore senza nulla da riprendere**: al posto di una riga di testo, "Niente da riprendere", una frase che spiega cosa comparirà lì (il capitolo da cui riprendere, quelli in corso, gli ultimi letti) e un pulsante "Vai alla Libreria".
- **Preferiti vuoti**: finora la sezione spariva del tutto (per non essere invasiva). Ora, se la libreria ha dei contenuti ma nessun preferito, compare un suggerimento compatto ("Tocca la stella accanto a una serie, un volume o un capitolo…") che si può **chiudere per sempre**: lo ricorda `hints.js`, in locale, come le altre preferenze, e se lo storage non c'è semplicemente ricompare. Compare solo a elenchi caricati (`loaded`): altrimenti lampeggerebbe per un istante prima dei dati veri.

"In corso di lettura" non ha un suggerimento a parte: vive nella scheda Lettore, il cui stato vuoto lo copre.

## 4. Ricontrollo dei file

Prima, un file spostato o cancellato fuori dall'app si scopriva solo aprendo quel capitolo. Ora una icona "ricarica" nell'intestazione della Libreria apre il **ricontrollo**, che parte da solo, mostra l'avanzamento ("Controllo in corso… 120 / 900 file", a blocchi di 20) e poi un riepilogo.

### Cosa si può sapere, e cosa no

Leggere un file richiede il **permesso**, e il permesso si può chiedere solo durante un tocco, uno per file: un ricontrollo in blocco non può chiederli. Perciò `checkLibraryFiles` (in `fileCheck.js`) fa così, per ogni capitolo con un file collegato:

1. se il permesso **non** è già concesso → "non verificabile" (un file mancante e uno presente non si distinguono senza il permesso: non si inventa un verdetto);
2. se è concesso → `getFile()`: se lancia `NotFoundError` il file **manca**, altrimenti è raggiungibile.

Il riepilogo distingue quattro casi: raggiungibili, **mancanti** (con l'elenco dei primi 8 nomi, perché se è saltata una cartella intera sono centinaia), non verificabili (si verificano aprendo il capitolo) e capitoli **senza file collegato** (quelli ripristinati da un backup, che non hanno mai avuto un file: non sono "mancanti", vanno ricollegati reimportando).

Per i mancanti si può **togliere i riferimenti dalla libreria** (`removeChapters`, un'unica transazione che toglie anche progresso e miniature): i file non si toccano, e non ci sono comunque.

### Il "pull-to-refresh" non c'è, di proposito

La roadmap parlava di un tira-per-aggiornare. Non l'ho fatto: su Android il browser ha già il suo, che **ricarica l'intera pagina**, e un secondo gesto simile in conflitto con quello (e con gli swipe) sarebbe fragile. Un pulsante esplicito fa la stessa cosa in modo prevedibile.

## 5. Verifica

In sandbox, con file veri nell'OPFS del browser:

- **Skeleton**: rallentando artificialmente le query, la Libreria mostra titolo e sei righe, con l'etichetta per gli screen reader; spariscono quando arrivano i dati.
- **Transizione**: aprendo una serie e un volume il contenitore ha la classe e l'animazione "forward" (0,22 s), tornando indietro "back"; al primo caricamento nessuna animazione; il dialog di rinomina resta fuori dal contenitore.
- **Stati vuoti**: suggerimento dei preferiti visibile, chiuso con la "x", ricordato dopo aver cambiato pagina e tornato; Lettore vuoto con il pulsante verso la Libreria.
- **Ricontrollo**: con un file presente, uno cancellato, uno con permesso simulato "da chiedere" e 11 capitoli senza file → 1 raggiungibile, 1 mancante (nominato), 1 non verificabile, 11 senza file collegato; "Togli dalla libreria" rimuove solo il mancante e il riepilogo si aggiorna.
- Lint e build passano.

Cosa **non** è stato verificato: il tablet; il ricontrollo con migliaia di capitoli (il costo di `getFile()` per file non è stato cronometrato); l'avanzamento durante il controllo (nei test era troppo veloce per vederlo); la `x` dei suggerimenti e le righe su schermi stretti oltre ai casi provati; `prefers-reduced-motion` (scritto, non provato).

## 6. Cosa si è imparato

- **Un segnaposto con la forma giusta** è meglio di un testo: evita i salti di layout.
- **`key` come interruttore di rimontaggio**: cambiare la `key` di un elemento fa ripartire le sue animazioni d'ingresso.
- **`transform` e `position: fixed`**: un antenato trasformato cambia il riferimento dei `fixed` — i dialog vanno fuori.
- **Dire cosa non si può sapere**: il ricontrollo riporta "non verificabile" invece di fingere certezza dove manca il permesso.
- **Non tutto ciò che è in roadmap va fatto alla lettera**: il pull-to-refresh avrebbe confliso con quello del browser; un pulsante è più prevedibile, e la decisione è documentata.
