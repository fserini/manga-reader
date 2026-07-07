# Fase 2 — PWA di base

> Documentazione didattica, scritta per chi non ha mai visto una PWA prima. Spiega **cosa** rende un sito web "installabile" come un'app e **cosa** abbiamo configurato in questa fase.

---

## 🎯 Obiettivo della fase

Trasformare l'app React (ancora vuota nei contenuti) in una **Progressive Web App**: installabile sulla home del tablet, con un'icona propria, e capace di aprirsi anche **offline**. Nessun contenuto nuovo in questa fase — solo l'infrastruttura che rende l'app "installabile".

---

## 🧩 Cos'è una PWA, in pratica

Una PWA (Progressive Web App) è un sito web che, grazie a due ingredienti, si comporta come un'app nativa:

1. Un **Web App Manifest**: un file di configurazione che dice al browser "questo sito può essere installato, ecco nome, icona e colori da usare"
2. Un **Service Worker**: uno script che gira in background nel browser e può intercettare le richieste di rete, permettendo all'app di funzionare anche senza connessione

Senza questi due pezzi, un sito resta "solo" un sito: si può aggiungere una scorciatoia alla home, ma si apre sempre dentro il browser con barra degli indirizzi visibile, e non funziona offline.

### Il Web App Manifest

È un file JSON (nel nostro caso generato automaticamente come `manifest.webmanifest`) con informazioni come:

- `name` / `short_name`: nome esteso e nome breve (quello sotto l'icona nella home)
- `icons`: le icone in varie dimensioni, usate per la home screen, lo splash screen, ecc.
- `theme_color`: colore della barra di sistema/status bar quando l'app è aperta
- `background_color`: colore di sfondo mostrato mentre l'app si sta caricando (splash screen)
- `display: "standalone"`: dice al browser di aprire l'app **senza** barra degli indirizzi, come un'app nativa

### Il Service Worker

È un file JavaScript speciale che il browser esegue in un "thread" separato dalla pagina, anche quando la pagina è chiusa. Le due capacità che ci interessano:

- Può **salvare in cache** i file dell'app (HTML, JS, CSS, icone) la prima volta che vengono scaricati
- Alle visite successive, può **rispondere dalla cache** invece di richiedere di nuovo i file al server — è questo che rende possibile l'uso offline

Scrivere un service worker a mano è complesso e pieno di casi limite. Per questo si usano librerie che lo generano automaticamente: nel nostro caso, **Workbox** (usata sotto il cofano da `vite-plugin-pwa`).

---

## 🛠️ Cosa abbiamo configurato in questa fase

### `vite-plugin-pwa`

Il plugin scelto in `02-analisi-tecnica.md` per integrare PWA in un progetto Vite. Genera automaticamente, ad ogni build, sia il `manifest.webmanifest` sia il service worker (`sw.js`), a partire dalla configurazione che scriviamo in `vite.config.js`.

```js
VitePWA({
  registerType: 'autoUpdate',
  devOptions: { enabled: true },
  manifest: {
    name: 'Manga Reader',
    short_name: 'Manga Reader',
    display: 'standalone',
    theme_color: '#121212',
    background_color: '#121212',
    icons: [ /* ... */ ],
  },
})
```

Due opzioni degne di nota:

- **`registerType: 'autoUpdate'`**: quando pubblichiamo una nuova versione dell'app, il service worker si aggiorna automaticamente in background, senza dover chiedere nulla all'utente. È la scelta più semplice per ora — la Fase 19 della roadmap introdurrà invece un banner "è disponibile una nuova versione", che richiede una logica diversa (`registerType: 'prompt'`)
- **`devOptions.enabled: true`**: normalmente il service worker viene generato solo in fase di build (`npm run build`), non durante lo sviluppo (`npm run dev`). Questa opzione lo attiva anche in dev, comodo per verificare rapidamente che tutto funzioni senza dover buildare ogni volta — ma per una verifica realistica (comportamento identico a quello che vedrà l'utente finale) conviene sempre testare con `npm run build` + `npm run preview`

### Le icone: `@vite-pwa/assets-generator`

Un manifest PWA richiede icone in più dimensioni (64×64, 192×192, 512×512...) più una versione "maskable" (pensata per riempire correttamente le forme delle icone Android, che possono essere cerchi, quadrati arrotondati, ecc. a seconda del launcher).

Non avendo ancora un logo definitivo, abbiamo generato un'**icona placeholder** (`src/assets/pwa-icon-source.svg`, un libro stilizzato) e usato `@vite-pwa/assets-generator` — lo strumento ufficiale dell'ecosistema `vite-plugin-pwa` — per derivarne automaticamente tutte le dimensioni richieste, salvate in `public/`:

```
public/
├── pwa-64x64.png
├── pwa-192x192.png
├── pwa-512x512.png
├── maskable-icon-512x512.png
├── apple-touch-icon-180x180.png
└── favicon.ico
```

Per rigenerarle in futuro (es. sostituendo `pwa-icon-source.svg` con un logo vero):

```
npx pwa-assets-generator --preset minimal src/assets/pwa-icon-source.svg
```

⚠️ Il comando salva i file nella cartella principale del progetto, non dentro `public/`: vanno spostati manualmente lì dopo la generazione (è così che abbiamo fatto anche questa prima volta).

### `index.html`

Aggiunti il meta tag `theme-color` (colore barra di sistema anche prima che il manifest sia letto) e il link `apple-touch-icon` (icona usata da Safari/iOS, che ignora il campo `icons` del manifest).

---

## ✅ Come verificare che funzioni

Il service worker "vero" (quello che vedrà l'utente finale) esiste solo nella build di produzione:

```
npm run build
npm run preview
```

Aprendo l'app da `npm run preview`, nei DevTools del browser (tab **Application**):

- **Manifest**: deve mostrare nome, icone e colori corretti, senza warning
- **Service Workers**: deve risultare uno service worker "activated and running"
- **Cache Storage**: deve contenere una cache Workbox con dentro HTML, JS, CSS, manifest e icone

Verificato in questa fase: manifest servito correttamente su `/manifest.webmanifest`, service worker attivo, cache Workbox popolata con tutti i file dell'app shell (12 entry, ~232 KB), nessuna richiesta di rete fallita.

### Il test più significativo: installazione reale sul tablet Android

Qui è emerso un vincolo tecnico importante: Chrome mostra il prompt "Installa app" (e registra il service worker) solo in un **contesto sicuro**. Per il browser, "sicuro" significa: pagina servita in **HTTPS**, oppure servita da **`localhost`** (unica eccezione, pensata apposta per lo sviluppo — un sito raggiunto tramite l'IP della rete locale, es. `http://192.168.1.x:5175`, invece **non** conta come sicuro).

Il nostro server (`npm run preview`) gira in HTTP semplice sul PC: perfetto per aprirlo dal PC stesso (`localhost`), ma non abbastanza per un test realistico dal tablet, che lo raggiungerebbe via IP di rete.

**Come abbiamo aggirato il problema, senza deployare nulla:** un **tunnel HTTPS temporaneo** con [cloudflared](https://github.com/cloudflare/cloudflared) (CLI gratuita di Cloudflare, senza bisogno di account per un tunnel "quick"):

```
cloudflared tunnel --url http://localhost:5175
```

Il comando crea, in pochi secondi, un URL pubblico del tipo `https://nome-casuale.trycloudflare.com` che fa da "specchio" HTTPS del server locale: chi lo apre (in questo caso il tablet) parla in HTTPS con Cloudflare, che a sua volta inoltra la richiesta al PC tramite una connessione in uscita (per questo non serve aprire porte sul router). Aperto quell'URL su Chrome Android è comparso correttamente il banner di installazione, confermando che manifest e service worker sono configurati bene.

Un dettaglio tecnico incontrato lungo il percorso: Vite, per difendersi da un attacco chiamato **DNS rebinding**, per default rifiuta richieste che arrivano con un nome host che non riconosce (`Blocked request. This host is not allowed`) — il dominio `trycloudflare.com` generato al volo non è ovviamente nella lista. Soluzione (solo temporanea, **non committata**): aggiungere `preview: { allowedHosts: true }` a `vite.config.js` giusto per la durata del test, poi rimuoverla subito dopo.

**Considerazioni di sicurezza su questo tipo di test:**

- ✅ L'app esposta era puramente statica (pagine vuote/placeholder): nessun backend, nessun dato reale, nessuna credenziale coinvolta
- ✅ Cloudflare fa da proxy: chi visita l'URL non vede mai l'indirizzo IP reale del PC/della rete di casa
- ✅ L'URL generato è casuale e non indicizzato: nessuno lo trova per caso
- ⚠️ Per la durata in cui il tunnel resta attivo, l'URL è comunque pubblico e **senza autenticazione** — chiunque lo intercettasse potrebbe aprirlo. Per questo il tunnel va tenuto acceso solo il tempo del test, e richiuso subito dopo (`Get-Process cloudflared | Stop-Process`)

**Questa non è la soluzione definitiva.** È un espediente utile solo per verificare rapidamente una fase in corso d'opera. La soluzione stabile arriverà con la **Fase 20 — Deploy pubblico e rifinitura**: una volta pubblicata l'app su GitHub Pages, avrà un URL pubblico fisso e già in HTTPS, installabile sul tablet in qualsiasi momento senza tunnel, cavi o server locali accesi.

---

## 🔜 Prossimi passi

L'icona è ancora un placeholder generico: andrà sostituita con un logo vero non appena disponibile (basta rigenerare gli asset come spiegato sopra). Il banner di notifica aggiornamento è rimandato alla Fase 19. La Fase 3 introdurrà i primi contenuti reali: lettura di un singolo file CBZ.
