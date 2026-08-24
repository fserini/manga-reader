# Fase 18 — Internazionalizzazione (i18n)

> Documentazione didattica, scritta per chi non ha mai visto React prima. Questa fase affronta un problema diverso da tutti i precedenti: non aggiunge una funzionalità nuova, ma **riscrive come l'app parla all'utente**, senza cambiarne il comportamento.

---

## 🎯 Obiettivo della fase

Rendere l'interfaccia disponibile in italiano e inglese, con un selettore in Impostazioni che ricordi la scelta. Fino a questa fase, ogni etichetta, messaggio ed errore era scritto direttamente nel codice, in italiano, mescolato alla logica.

---

## 🧩 Il problema con le stringhe scritte a mano

Cercare "Rimuovere" nel codice prima di questa fase avrebbe dato decine di risultati, sparsi tra `Catalog.jsx`, `DeleteDialog.jsx`, `Library.jsx`... Ogni componente conteneva le proprie frasi italiane, scritte direttamente dentro il JSX:

```jsx
<h2>Rimuovere {label}?</h2>
```

Aggiungere una seconda lingua a un progetto fatto così richiederebbe if/else sparsi ovunque (`lang === 'it' ? 'Rimuovere' : 'Remove'`), presto ingestibili. La soluzione standard, in qualunque framework, è opposta: **separare il testo dal codice**. Il codice dichiara *quale* messaggio vuole mostrare (una chiave, tipo `deleteDialog.title`), e un file a parte — uno per lingua — dice *come* tradurla. Il codice diventa così identico in ogni lingua; cambia solo il file consultato.

---

## 🧰 La libreria: i18next + react-i18next

Diversamente da tema (Fase 17) e stato applicativo in generale, per l'internazionalizzazione il progetto adotta una libreria esterna invece di codice scritto da zero, come indicato fin dall'analisi tecnica iniziale. Il motivo è che un sistema i18n "fatto in casa" finisce presto per reinventare, peggio, funzionalità che una libreria matura offre già pronte: interpolazione di valori dentro le frasi, **pluralizzazione** (frasi diverse per "1 file" e "3 file" — l'italiano e l'inglese condividono la stessa regola singolare/plurale, ma altre lingue ne hanno di più complesse), rilevamento automatico della lingua del browser, fallback quando manca una traduzione.

Il progetto usa **i18next** (il motore di traduzione, agnostico dal framework) insieme a **react-i18next** (il collante che lo espone a React tramite un hook) e **i18next-browser-languagedetector** (rileva e ricorda la lingua, lo stesso compito che in `ThemeContext` — Fase 17 — avevamo scritto a mano con `localStorage`).

---

## 📁 I file di traduzione

Due file JSON, uno per lingua, con la stessa identica struttura ad albero — [`src/locales/it.json`](../../src/locales/it.json) e [`src/locales/en.json`](../../src/locales/en.json):

```json
{
  "settings": {
    "title": "Impostazioni",
    "theme": { "light": "Chiaro", "dark": "Scuro", "system": "Sistema" }
  }
}
```

Ogni sezione dell'app (libreria, catalogo, lettore, impostazioni...) è un ramo dell'albero, così una chiave come `catalog.deleteSeries` indica a colpo d'occhio sia *dove* si usa sia *cosa* fa. Le chiavi sono identiche nei due file: cambia solo il testo a destra.

Le frasi con un valore variabile usano un segnaposto tra doppie graffe:

```json
"deleteSeries": "Rimuovi la serie {{title}}",
"volumeLabel": "Volume {{number}}"
```

### Pluralizzazione: `_one` / `_other`

Per i messaggi che cambiano forma in base a un conteggio, i18next riconosce una convenzione di nomi: `chiave_one` per il caso singolare, `chiave_other` per tutti gli altri (incluso zero):

```json
"duplicates_one": "1 file era già in libreria ed è stato saltato.",
"duplicates_other": "{{count}} file erano già in libreria e sono stati saltati."
```

Passando `{ count: n }`, i18next sceglie da solo la forma giusta — non serve scrivere `n === 1 ? ... : ...` nel componente:

```js
t('library.notice.duplicates', { count: result.duplicates })
```

---

## ⚙️ L'inizializzazione: [`src/i18n.js`](../../src/i18n.js)

```js
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    fallbackLng: 'it',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });
```

`.use(...)` registra dei "plugin" di i18next prima di inizializzarlo: `LanguageDetector` per la scelta automatica/persistita della lingua, `initReactI18next` per collegarlo a React. `resources` porta dentro i due file JSON letti sopra. `detection.order` dice: prima guarda `localStorage` (una scelta già salvata in passato), altrimenti deduci dalla lingua del browser (`navigator.language`); `caches` dice dove salvare la scelta una volta fatta.

Questo file va eseguito una sola volta, il prima possibile — per questo è importato come effetto collaterale (senza usarne l'export) direttamente in [`main.jsx`](../../src/main.jsx), prima che `App` inizi a renderizzare:

```js
import './i18n.js';
```

---

## 🗣️ Usarlo nei componenti: l'hook `useTranslation`

Ogni componente che mostra testo importa l'hook e lo chiama una volta all'inizio:

```js
const { t } = useTranslation();
```

`t` (da *translate*) è la funzione che, data una chiave, restituisce la frase nella lingua corrente:

```jsx
<h1>{t('settings.title')}</h1>
<button>{t('deleteDialog.cancel')}</button>
<p>{t('deleteDialog.title', { label })}</p>
```

Il secondo argomento, quando presente, fornisce i valori per i segnaposto `{{...}}` visti sopra. Non serve altro: `t` è già collegato, dietro le quinte, al Context creato da `initReactI18next` (lo stesso meccanismo di condivisione visto in Fase 17, qui offerto già pronto dalla libreria invece di scritto a mano).

### Un'eccezione: le liste definite fuori dal componente

Alcune liste di opzioni — le modalità di lettura, i temi, le lingue stesse — erano definite come costanti **fuori** dal componente, per non ricrearle ad ogni render:

```js
const READING_MODES = [
  { value: 'single', label: 'Pagina singola' },
  // ...
];
```

Il problema: `t()` esiste solo *dentro* un componente React (è un hook). Una costante di modulo non può chiamarlo. La soluzione è separare il *dato* (invariante) dalla sua *traduzione* (che dipende dalla lingua corrente): la costante conserva solo la chiave, e la traduzione avviene al momento di disegnarla, dentro il componente:

```js
const READING_MODES = [
  { value: 'single', key: 'reader.mode.single' },
  // ...
];

// dentro il componente:
{READING_MODES.map(({ value, key }) => (
  <button key={value}>{t(key)}</button>
))}
```

---

## 🔍 Un dettaglio secondario: la ricerca capisce la lingua attiva

Nel Catalogo, la ricerca testuale su volumi e capitoli confrontava la query digitata con una stringa costruita a mano, sempre in italiano:

```js
volumes.filter((v) => `volume ${v.number}`.includes(query))
```

Con l'interfaccia in inglese, un utente che digita "volume" per cercare troverebbe comunque risultato (la parola coincide nelle due lingue), ma "capitolo" no, perché in inglese il capitolo si chiama "chapter". La ricerca ora confronta con la stessa etichetta tradotta già mostrata a schermo:

```js
volumes.filter((v) => t('catalog.volumeLabel', { number: v.number }).toLowerCase().includes(query))
```

Un piccolo esempio di un principio più generale di questa fase: una volta che una frase è tradotta in un punto, conviene riusare *quella* traduzione ovunque serva la stessa informazione, invece di tenere una seconda copia hardcoded che rischia di disallinearsi.

---

## 🔤 Il selettore di lingua in Impostazioni

Stessa forma del selettore di tema (Fase 17): un gruppo di pulsanti "radio", ma qui il valore non viene da un Context scritto a mano, bensì direttamente dall'oggetto `i18n` restituito da `useTranslation`:

```jsx
const { t, i18n } = useTranslation();

<button
  aria-checked={i18n.resolvedLanguage === option.value}
  onClick={() => i18n.changeLanguage(option.value)}
>
  {t(option.key)}
</button>
```

`i18n.changeLanguage(...)` fa tre cose in un colpo solo: aggiorna la lingua attiva, salva la scelta (grazie a `LanguageDetector`, configurato per scrivere su `localStorage`), e — punto cruciale — **fa ri-renderizzare automaticamente ogni componente che usa `useTranslation`**, ovunque si trovi nell'albero. Non è necessario notificare manualmente le altre pagine: `react-i18next` colleziona tutti gli usi di `t` come "iscritti" alla lingua corrente, esattamente come `useContext` in Fase 17.

`i18n.resolvedLanguage` (non `i18n.language`) è il valore usato per evidenziare il pulsante attivo: `language` può essere una stringa più specifica come `en-US` (rilevata dal browser), mentre `resolvedLanguage` è già ridotta a una delle lingue effettivamente supportate (`it` o `en`) — il confronto con `option.value` funziona in entrambi i casi solo usando quest'ultima.

I nomi delle lingue nel selettore ("Italiano", "English") sono scritti identici in entrambi i file di traduzione: per convenzione, un selettore di lingua mostra ogni opzione nel proprio nome nativo, non tradotta nella lingua correntemente attiva — altrimenti "English" diventerebbe "Inglese" quando l'app è in italiano, rendendo più difficile riconoscere a colpo d'occhio la propria lingua in un menu.

---

## ✅ Come verificare che funzioni

Verificato nell'ambiente sandbox, con dati di prova creati direttamente nel database (serie, volume, due capitoli, un capitolo da categorizzare, preferiti su tutti e tre i livelli):

- **Cambio lingua da Impostazioni**: passando a "English", l'intera interfaccia si aggiorna immediatamente — navigazione, Libreria (vuota e con contenuti), Catalogo (breadcrumb, ricerca, ordinamento, card di serie/volumi/capitoli con conteggio letti), Preferiti (tutte le sezioni, con interpolazione "Test Series · Volume 1" / "Test Series · Ch. 1"), form di categorizzazione (titoli, placeholder, messaggi di validazione), dialog di conferma rimozione (titolo, nota, tre pulsanti), Lettore (schermata vuota).
- **Persistenza**: dopo un reload completo, la lingua scelta ("English") resta attiva.
- **Cambio inverso** (English → Italiano): stessa verifica, tutte le stringhe tornano correttamente in italiano.
- **Nessuna chiave mancante**: nessun testo mostrato a schermo nella forma letterale `sezione.chiave` (il segnale visivo di una traduzione dimenticata).
- **Nessun errore in console** in nessuno degli scenari sopra.
- `npm run lint` pulito.

Da verificare sul dispositivo reale (fuori dalla portata dell'ambiente sandbox):
- Rilevamento automatico della lingua dalla preferenza del browser/sistema alla primissima apertura dell'app (mai visitata prima, `localStorage` vuoto) — qui sempre verificato con una scelta esplicita già presente.
- Le stringhe di errore raggiungibili solo con veri file/permessi del File System Access API (es. "Permesso di accesso al file negato", i messaggi di fallimento nella cancellazione fisica) sono tradotte nel codice ma non riproducibili in sandbox.

---

## 🔜 Prossimi passi

**Fase 19** introduce la notifica di aggiornamento della PWA: un banner che avvisa l'utente quando è disponibile una nuova versione dell'app, così da non restare bloccati su una versione vecchia della cache offline.
