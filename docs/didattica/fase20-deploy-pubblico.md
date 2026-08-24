# Fase 20 — Deploy pubblico e rifinitura

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa è l'ultima fase della roadmap: non aggiunge funzionalità, ma porta l'app **fuori dal computer di sviluppo**, su un URL pubblico raggiungibile da chiunque — il momento in cui tutto il lavoro fatto finora smette di essere "in locale" per diventare un prodotto reale.

---

## 🎯 Obiettivo della fase

Pubblicare l'app su un URL pubblico stabile, con un deploy automatico ad ogni aggiornamento di `main`, e verificarne l'installazione reale su un tablet Android.

---

## 🏠 Un dettaglio che cambia tutto: l'app non vive più alla radice

Finora, in sviluppo, l'app è sempre stata raggiungibile alla radice di un indirizzo (`http://localhost:5174/`). **GitHub Pages**, il servizio di hosting statico gratuito scelto fin dall'analisi tecnica iniziale, pubblica un repository personale (non un dominio proprio) come "project site": sotto `https://<utente>.github.io/<nome-repo>/`, cioè `https://fserini.github.io/manga-reader/` — non alla radice del dominio `fserini.github.io`, ma in un sottopercorso con il nome del repository.

Questo sembra un dettaglio da nulla, ma **rompe in silenzio** tre cose diverse se non gestito esplicitamente:

1. i link a script, CSS e immagini nell'HTML, che finora presupponevano di partire da `/`;
2. il router lato client (React Router), che deve sapere che l'app "vive" sotto `/manga-reader/` e non alla radice, altrimenti costruisce link interni sbagliati;
3. il manifest della PWA (`start_url`, `scope`), che determina da dove riparte l'app quando viene aperta dall'icona installata.

---

## 🔀 Un `base` diverso per sviluppo e produzione

La soluzione, in [`vite.config.js`](../../vite.config.js), è dire esplicitamente a Vite dove vivrà l'app:

```js
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/manga-reader/' : '/';

  return {
    base,
    // ...
  };
});
```

`defineConfig` può ricevere, invece di un oggetto fisso, una **funzione** che riceve informazioni sul contesto in cui Vite sta girando — qui, `command`, che vale `'build'` durante `npm run build` (la build di produzione, quella che finisce su GitHub Pages) e un altro valore durante lo sviluppo (`npm run dev`). Il `base` calcolato cambia di conseguenza: `/manga-reader/` solo in produzione, `/` (come sempre) in sviluppo. Questo è importante non solo per correttezza, ma anche per **non rompere il flusso di lavoro** seguito in tutte le fasi precedenti: il server di sviluppo locale, usato per ogni test in questo percorso, continua a funzionare esattamente come prima.

Con `base` impostato, Vite riscrive da solo — durante la build — ogni riferimento assoluto (`/favicon.svg`, `/src/main.jsx`, eccetera) in `index.html`, anteponendo il prefisso giusto. Non serve toccare `index.html` a mano.

### Il router deve saperlo anche lui

React Router, di suo, non ha modo di sapere che l'app non vive alla radice: costruirebbe comunque link come `/settings` invece di `/manga-reader/settings`. Si dichiara con la prop `basename` di `BrowserRouter`, in [`main.jsx`](../../src/main.jsx):

```jsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

`import.meta.env.BASE_URL` è una variabile che Vite espone automaticamente a runtime, già uguale allo stesso `base` calcolato sopra (`/` in sviluppo, `/manga-reader/` in produzione) — non è necessario ripetere la logica due volte, si legge lo stesso valore già calcolato da Vite.

### E anche il manifest della PWA

`start_url` e `scope` nel manifest (generato da `vite-plugin-pwa`) determinano rispettivamente da dove riparte l'app aperta dall'icona installata, e quali URL sono "sotto il controllo" della PWA. Anche questi vengono impostati allo stesso `base`:

```js
manifest: {
  start_url: base,
  scope: base,
  // ...
}
```

---

## 🕳️ Il buco nascosto: refresh su una pagina interna

React Router, con `BrowserRouter`, usa la vera *History API* del browser: l'URL nella barra degli indirizzi cambia davvero (es. `/manga-reader/settings`), non è un frammento finto (`#/settings`). Il vantaggio è un URL pulito e condivisibile; lo svantaggio si vede quando quell'URL viene richiesto **direttamente al server** — ricaricando la pagina, o aprendo un link diretto a `/manga-reader/reader/12`.

GitHub Pages è un semplice server di file statici: quando riceve una richiesta per `/manga-reader/reader/12`, cerca *davvero* un file o una cartella con quel percorso. Non lo trova (non esiste alcun file `reader/12` — quella è solo una rotta che il JavaScript dell'app sa interpretare *dopo* essere stato caricato), e risponderebbe con un errore 404, prima ancora che React abbia la possibilità di intervenire.

La soluzione è un trucco molto diffuso per le SPA su GitHub Pages, che sfrutta un comportamento documentato del servizio: se GitHub Pages non trova un file per un percorso richiesto, serve il contenuto di un file `404.html` alla radice del sito (mantenendo comunque lo status HTTP 404, ma restituendo quel contenuto). Basta che `404.html` sia **identico** a `index.html`: il browser carica comunque l'app React, che a quel punto legge l'URL corrente da `window.location` e mostra la pagina giusta — nessun redirect visibile, nessun lampo di errore.

Automatizzato con uno script eseguito subito dopo ogni build, in [`package.json`](../../package.json):

```json
"scripts": {
  "build": "vite build",
  "postbuild": "node -e \"require('fs').copyFileSync('dist/index.html','dist/404.html')\""
}
```

npm esegue automaticamente uno script chiamato `postbuild` subito dopo `build`, per convenzione — non serve invocarlo esplicitamente, né una libreria in più: `fs.copyFileSync` è già parte di Node.

---

## 🤖 La pipeline: build, verifica e pubblicazione automatiche

Il file [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) descrive una **GitHub Action**: una sequenza di passi che GitHub esegue da sé, su una macchina temporanea, ogni volta che succede un evento scelto — qui, ogni push su `main`.

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

`workflow_dispatch` aggiunge la possibilità di far ripartire la pipeline a mano dalla scheda "Actions" di GitHub, utile per ripubblicare senza dover creare un commit vuoto solo per quello.

La pipeline è divisa in due **job** (fasi indipendenti, ciascuna su una macchina pulita):

1. **`build`**: scarica il codice, installa Node (la stessa versione dichiarata in `.nvmrc`, per coerenza con l'ambiente di sviluppo), installa le dipendenze (`npm ci`, la versione "rigorosa" di `npm install` che rispetta esattamente `package-lock.json`), esegue lint e build, e impacchetta la cartella `dist/` come "artifact" (un pacchetto scaricabile, il ponte tra i due job).
2. **`deploy`**: prende l'artifact prodotto da `build` e lo pubblica su GitHub Pages, tramite un'azione ufficiale (`actions/deploy-pages`).

Un dettaglio di sicurezza degno di nota: il job di deploy non usa una password o un token salvato a mano nei "secrets" del repository, ma un **token OIDC di breve durata**, generato al volo da GitHub stesso per quella singola esecuzione e valido solo per pubblicare su *quel* repository specifico — dichiarato dando al workflow i permessi minimi necessari (`pages: write`, `id-token: write`), niente di più.

---

## ✅ Come verificare che funzioni

Verificabile in sandbox, con build reali e un server statico locale che replica il sottopercorso:

- **Build di produzione**: genera correttamente `index.html`, `manifest.webmanifest`, `sw.js` e `404.html`, tutti con i percorsi prefissati `/manga-reader/` (verificato ispezionando direttamente i file generati).
- **App funzionante sotto il sottopercorso**: servita con un server locale configurato sullo stesso `base` di produzione, l'app carica, la navigazione tra Libreria/Lettore/Impostazioni funziona, e l'URL nella barra degli indirizzi riflette correttamente il prefisso (`/manga-reader/settings`).
- **Nessuna regressione in sviluppo**: `npm run dev` continua a servire l'app alla radice (`/`) esattamente come in ogni fase precedente, banner di aggiornamento e navigazione compresi.
- `npm run lint` e `npm run build` puliti.

Non verificabile in sandbox (limite dell'ambiente, non del codice):
- **Registrazione del service worker sotto il sottopercorso**: testata esplicitamente, fallisce nell'ambiente sandbox con un errore generico del browser ("An unknown error occurred when fetching the script") — riprodotto anche con un service worker minimo di prova, quindi non legato al contenuto generato da `vite-plugin-pwa` ma a una limitazione del proxy locale usato dall'ambiente di test per servire pagine in anteprima, che sembra non supportare la registrazione di service worker con scope diverso dalla radice. La stessa identica configurazione ha funzionato correttamente alla radice (Fase 19). Questa è una configurazione standard e ampiamente documentata per `vite-plugin-pwa` su GitHub Pages: **da confermare sul sito pubblico reale**, dove non c'è alcun proxy intermedio.
- **Il trucco del `404.html`**: la sua logica è verificata staticamente (file generato, identico a `index.html`), ma il comportamento specifico "servi 404.html su un path non trovato, con status 404" è una caratteristica del server di GitHub Pages, non replicabile da un server locale generico — **da confermare sul sito pubblico reale** (es. ricaricando la pagina su una rotta interna, o aprendo un link diretto a un capitolo).
- **Installazione reale su tablet Android**, dall'URL pubblico: richiede un dispositivo reale.

---

## 🔜 Prossimi passi

Con questa fase si chiude la roadmap. Il progetto resta comunque aperto: il backlog futuro (in [`03-roadmap-sviluppo.md`](../pianificazione/03-roadmap-sviluppo.md)) elenca alcune direzioni possibili — riconoscimento automatico dei nomi file, migrazione a TypeScript, statistiche di lettura, test automatici — da riprendere quando (e se) servirà davvero, non prima.
