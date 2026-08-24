# Fase 19 — Aggiornamenti PWA

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase tocca un meccanismo che finora l'app usava senza che nessuno se ne accorgesse: il **service worker**, il "motore" che rende possibile l'uso offline (Fase 2), e il momento delicato in cui quel motore viene sostituito con una versione più nuova.

---

## 🎯 Obiettivo della fase

Avvisare l'utente quando è disponibile una nuova versione dell'app, con un banner che gli lasci scegliere *quando* aggiornare — invece di farlo sparire e ricomparire aggiornato sotto le sue dita senza preavviso.

---

## 🧩 Cosa succedeva prima, in silenzio

Fin dalla Fase 2, `vite-plugin-pwa` genera automaticamente un **service worker**: uno script che il browser installa a parte, capace di intercettare le richieste di rete e rispondere con file salvati in una cache locale — è quello che permette all'app di aprirsi anche offline. Ogni volta che il codice dell'app cambia (una nuova build, cioè una nuova fase mergiata), il contenuto del service worker cambia con esso, e il browser se ne accorge da solo confrontandolo byte per byte con quello attivo.

La configurazione usata finora, `registerType: 'autoUpdate'`, diceva al service worker cosa fare in quel momento: **sostituirsi silenziosamente** e forzare un ricaricamento della pagina, senza chiedere nulla. Comodo per non restare mai indietro, ma con un effetto collaterale reale: se l'utente sta leggendo un capitolo quando la nuova versione viene rilevata, la pagina può ricaricarsi sotto di lui, interrompendolo.

---

## 🔀 Il cambio di strategia: `'prompt'`

Un solo valore cambiato in [`vite.config.js`](../../vite.config.js):

```js
VitePWA({
  registerType: 'prompt', // era 'autoUpdate'
  // ...
})
```

Con `'prompt'`, il nuovo service worker viene comunque scaricato e installato in background non appena disponibile, ma **resta in attesa** (lo stato tecnico si chiama proprio *waiting*) invece di attivarsi da solo. Tocca al codice dell'app decidere quando dirgli "ora vai": ed è qui che entra in scena l'interfaccia.

---

## 🔌 Il collegamento a React: `useRegisterSW`

`vite-plugin-pwa` genera, oltre al service worker vero e proprio, anche un piccolo modulo "virtuale" (`virtual:pwa-register/react` — non un file reale sul disco, ma qualcosa che Vite costruisce al volo) con un hook pronto all'uso: [`src/components/UpdatePrompt.jsx`](../../src/components/UpdatePrompt.jsx):

```jsx
import { useRegisterSW } from 'virtual:pwa-register/react';

const {
  needRefresh: [needRefresh, setNeedRefresh],
  updateServiceWorker,
} = useRegisterSW();
```

`needRefresh` è una coppia `[valore, funzione-per-cambiarlo]` — esattamente la stessa forma restituita da `useState`. Non è un caso: `useRegisterSW` è essa stessa costruita sopra `useState` all'interno della libreria, e diventa `true` automaticamente nel momento in cui il service worker rileva un nuovo waiting worker, senza che il componente debba fare nulla per "ascoltarlo" — la sottoscrizione è già inclusa nell'hook.

`updateServiceWorker` è la funzione che dice al worker in attesa "attivati ora": prende il controllo della pagina e (passandole `true`) ricarica la finestra, questa volta con il consenso esplicito dell'utente.

---

## 🍞 Il banner

Il componente è minimale: se non c'è nulla da aggiornare, non renderizza nulla (`return null`); altrimenti mostra un banner fisso in fondo allo schermo con due pulsanti:

```jsx
if (!needRefresh) return null;

return (
  <div className="update-prompt" role="alert">
    <p>{t('pwa.updateAvailable')}</p>
    <div className="update-prompt-actions">
      <button onClick={() => setNeedRefresh(false)}>{t('pwa.dismiss')}</button>
      <button onClick={() => updateServiceWorker(true)}>{t('pwa.reload')}</button>
    </div>
  </div>
);
```

- **"Più tardi"** chiama `setNeedRefresh(false)`: nasconde solo il banner nello stato React di *questo* componente. Il service worker resta in attesa esattamente come prima — non è stato "rifiutato per sempre", solo rimandato. Ricaricando la pagina (o alla prossima apertura dell'app), se il worker in attesa è ancora quello, il banner ricompare.
- **"Aggiorna"** chiama `updateServiceWorker(true)`: attiva la nuova versione e ricarica, questa volta con il permesso dato.

Il componente è montato una volta sola in [`App.jsx`](../../src/App.jsx), fuori dalle `<Routes>`, appena prima della chiusura del contenitore principale:

```jsx
<UpdatePrompt />
```

Essendo `position: fixed` in CSS, non importa *dove* nell'albero venga renderizzato: resta ancorato in basso sullo schermo indipendentemente dalla pagina in cui si trova l'utente (Libreria, Lettore o Impostazioni), perché la disponibilità di un aggiornamento non ha nulla a che fare con quale pagina è aperta in quel momento.

---

## ✅ Come verificare che funzioni

L'ambiente sandbox non ha un service worker "vero" in modalità sviluppo (`npm run dev`) paragonabile a quello di produzione, quindi la verifica ha richiesto un ciclo di build reale:

1. `npm run build` per generare la prima versione del service worker.
2. `vite preview` per servirla come farebbe un hosting statico vero.
3. Verificato: app funzionante, service worker registrato e attivo, nessun banner (nessun aggiornamento in attesa).
4. Modifica minima al codice sorgente e **rebuild** (`npm run build` di nuovo), senza fermare il server di anteprima — simula esattamente cosa succede quando una nuova fase viene deployata mentre l'utente ha già l'app aperta.
5. Ricaricata la pagina: il browser rileva il nuovo service worker, lo scarica e lo mette in attesa.
6. **Banner comparso** con il messaggio corretto e i due pulsanti.
7. **"Più tardi"**: banner nascosto, service worker confermato ancora in stato *waiting* (non attivato).
8. Ricaricando di nuovo la pagina, il banner ricompare (l'aggiornamento in sospeso non è stato dimenticato).
9. **"Aggiorna"**: la pagina si è ricaricata da sola; verificato che il nuovo service worker è ora quello attivo (`active: true`, `waiting: false`) e che il codice aggiornato è davvero in esecuzione.
10. Nessun errore in console in nessuno degli scenari sopra.
11. `npm run lint` pulito.

Da verificare sul dispositivo reale (fuori dalla portata dell'ambiente sandbox):
- Il comportamento quando l'aggiornamento arriva mentre l'app è **installata** come PWA standalone (icona sulla home, non una scheda del browser) — qui sempre testato in una scheda normale.
- I tempi reali con cui il browser controlla la presenza di nuove versioni in produzione (qui il controllo è stato forzato manualmente per rendere il test riproducibile, invece di aspettare il normale controllo periodico del browser).

---

## 🔜 Prossimi passi

Con questa fase si chiudono le fasi trasversali della roadmap. Resta la **Fase 20 — Deploy pubblico e rifinitura**: la messa online reale su GitHub Pages, il primo terreno dove tutto ciò che finora è stato "verificato in sandbox, da confermare sul dispositivo" troverà una verifica completa.
