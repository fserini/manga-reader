# Fase 36 — Schermo intero nel Lettore

> Nata da una osservazione di Federico sul tablet: toccando al centro della pagina i controlli e la barra dell'app spariscono, ma in alto resta una striscia, quella che copre **data e ora di Android**. E il filo di avanzamento in basso, a controlli nascosti, toglie spazio alla pagina. Due problemi diversi, un solo tocco.

---

## 1. Capire cosa si vede

Prima di cambiare qualcosa ho controllato che cosa fa oggi il "tocco al centro": nasconde i controlli del Lettore e **toglie dalla pagina la barra dell'app** (`App.jsx` la smonta quando `chromeHidden` è vero). Quindi non resta nessuno spazio vuoto lasciato dalla barra: misurato in sandbox, a barra nascosta la pagina occupa **tutta** l'altezza della finestra. La striscia che Federico vede è un'altra cosa: **la barra di stato di sistema**, che il browser disegna sopra l'app e a cui una pagina web non può dire di sparire... a meno che non chieda lo schermo intero.

## 2. La Fullscreen API

Il browser offre `element.requestFullscreen()`: la pagina chiede di occupare l'intero schermo, barra di stato compresa (`document.exitFullscreen()` per tornare indietro). Tre regole da rispettare:

- **Serve un gesto dell'utente.** Il browser accetta la richiesta solo entro qualche secondo da un tocco ("attivazione transitoria"). Qui la richiesta parte da un effetto che scatta quando i controlli si nascondono, cioè dopo il tocco centrale e il suo breve ritardo (il Lettore aspetta 300 ms per distinguere un tocco singolo da un doppio): ampiamente dentro la finestra.
- **Può non esistere o rifiutare.** Su alcuni browser (iPhone) non c'è; altrove può dire di no. `fullscreen.js` raccoglie tre funzioni piccole e a prova di errore (`isFullscreenSupported`, `enterFullscreen`, `exitFullscreen`): un rifiuto si ignora, e il Lettore funziona comunque, con la barra di sistema visibile.
- **L'utente può uscirne da solo**, con il gesto del sistema o, su computer, con Esc. In quel caso l'evento `fullscreenchange` fa tornare i controlli: altrimenti il Lettore resterebbe "a schermo intero" per l'app ma non più per il browser, con i controlli nascosti e nessun modo ovvio di richiamarli. Lasciando il Lettore, un'uscita esplicita dallo schermo intero si fa sempre (la cleanup dell'effetto).

Si poteva anche mettere `display: fullscreen` nel manifest della PWA: avrebbe reso a schermo intero **tutta** l'app, sempre. Non è quello che si chiedeva (la barra di stato serve fuori dal Lettore) e non si prova in sandbox, quindi non l'ho fatto.

## 3. Il filo di avanzamento: tre varianti, da provare

Federico voleva provare il filo (numero di pagina e barra sottile) "trasparente o del tutto nascosto". Invece di scegliere io, ho fatto **tre varianti selezionabili** in Impostazioni → Aspetto, e si sceglie guardando il tablet vero:

- **Visibile**: come prima, una striscia sotto la pagina.
- **Trasparente** (predefinito): sovrapposto al fondo della pagina (`position: absolute`), senza sfondo, con opacità 0,6; il testo ha un'ombra per restare leggibile su qualunque immagine, e non intercetta i tocchi (che servono alla pagina). Le pagine usano **tutta** l'altezza: in sandbox 902 px contro 811 con il filo in fila.
- **Nascosto**: il filo non viene proprio disegnato.

La scelta vale **solo a controlli nascosti**: appena i controlli tornano, il filo è quello di sempre.

## 4. Due preferenze nuove

Nelle preferenze di aspetto (`uiPreferences.js`, salvate in locale) si aggiungono `fullscreen` ('on' / 'off', predefinito acceso) e `thread` ('visible' / 'transparent' / 'hidden'). Come le altre, un valore sconosciuto o rovinato ricade sul predefinito. In Impostazioni, sotto la pagina iniziale, due gruppi di pulsanti; se il browser non supporta lo schermo intero, un testo lo dice invece di far credere che la scelta abbia effetto.

## 5. Verifica

In sandbox il browser non può mostrare la barra di stato di un tablet, né un vero schermo intero in questo ambiente, quindi **ho sostituito la Fullscreen API con una finta** (stessi metodi e stesso evento) per provare la logica:

- tocco al centro → i controlli e la barra spariscono, parte **una** richiesta con l'opzione `navigationUI: 'hide'`, il filo diventa trasparente e sovrapposto (pagine a tutta altezza);
- uscita "col gesto del sistema" (simulata) → i controlli e la barra tornano, il filo torna in fila;
- altro tocco → di nuovo nascosti, un'altra richiesta; ancora un tocco → `exitFullscreen` e controlli visibili;
- **Nascosto**: nessun filo a controlli nascosti; **Visibile**: filo in fila anche a controlli nascosti;
- **Schermo intero disattivato**: nessuna richiesta, ma i controlli si nascondono lo stesso;
- le due preferenze compaiono in Impostazioni e si salvano.

Cosa **non** è stato verificato, e sta a Federico sul tablet:

- che il browser **accetti davvero** la richiesta (in un'app installata o in una scheda, con Chrome del tablet) e che la barra di stato sparisca;
- **come si esce** col gesto del sistema e che i controlli tornino;
- l'aspetto delle tre varianti del filo su pagine vere;
- schermi con **tacca** o angoli arrotondati: non si è toccato `viewport-fit` né le aree sicure, quindi su un dispositivo con tacca il contenuto potrebbe finire sotto o restare in una cornice. Se succede, è un ritocco.

## 6. Cosa si è imparato

- **Misurare prima di intervenire**: il sospetto "uno spazio vuoto lasciato dalla barra" era sbagliato; la striscia era un'altra cosa (la barra di sistema).
- **Un'API del browser va usata con rete di sicurezza**: può mancare, rifiutare, o essere chiusa dall'utente; ogni caso va previsto.
- **Quando non si sa quale variante è migliore, si fanno scegliere all'utente**, con un valore predefinito ragionevole, invece di indovinare.
- **Simulare ciò che non si può raggiungere**: con una finta della Fullscreen API si prova la logica anche dove non esiste lo schermo vero, dichiarando che la prova finale resta sul dispositivo.
