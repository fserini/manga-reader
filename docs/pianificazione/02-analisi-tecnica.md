# Manga Reader PWA — Analisi Tecnica

> Documento di riepilogo delle decisioni tecniche prese in fase di pianificazione, prima dell'inizio dello sviluppo.

---

## 🛠️ Stack Tecnico Proposto

| Ambito | Scelta | Motivazione |
|---|---|---|
| **Linguaggio** | JavaScript (no TypeScript, almeno inizialmente) | Evitare di sovrapporre l'apprendimento di React e di un sistema di tipi allo stesso tempo. TypeScript resta una possibile evolutiva futura, una volta consolidati i concetti base di React |
| **Framework** | React | Richiesta esplicita del progetto |
| **Build tool** | Vite | Più moderno, semplice e veloce di alternative come Create React App (obsoleto); ottima integrazione con PWA |
| **PWA** | `vite-plugin-pwa` | Gestisce automaticamente service worker, manifest, cache offline e notifica di nuova versione disponibile |
| **Lettura archivi CBZ** | `JSZip` | Un file CBZ è tecnicamente uno ZIP rinominato: libreria leggera, matura e molto diffusa |
| **Lettura archivi CBR** | `libarchive.js` (WebAssembly) | Il formato RAR è proprietario e più complesso da decomprimere via JS puro; questa libreria funziona offline nel browser |
| **Dati locali** (libreria, progressi, preferiti) | IndexedDB tramite `Dexie.js` | L'API nativa di IndexedDB è scomoda da usare; Dexie la rende semplice e leggibile, ideale per chi è alle prime armi |
| **Accesso ai file sul tablet** | Da definire in dettaglio (File System Access API vs File Picker classico) | Punto tecnico delicato su Android/Chrome — verrà approfondito come step dedicato prima di sviluppare questa parte |
| **Navigazione tra schermate** | React Router | Standard de facto per gestire le viste dell'app (libreria, lettore, impostazioni) |
| **Gestione dello stato** | Context API + Hooks (nativi di React) | Nessuna libreria esterna per ora: approccio più didattico per imparare i concetti fondamentali di React prima di introdurre librerie come Redux o Zustand |
| **Test automatici** | Non prioritari nell'MVP | Da introdurre in una fase successiva del percorso di studio |
| **CI/CD** | GitHub Actions → deploy automatico su GitHub Pages ad ogni push su `main` | Gratuito, illimitato per repository pubblici, introduce anche il concetto di automazione/pipeline |
| **Hosting** | GitHub Pages | Gratuito, si integra direttamente col repository, permette di installare la PWA sul tablet tramite link pubblico |
| **Repository** | Pubblico | Necessario per l'uso gratuito e illimitato di GitHub Pages |
| **Licenza** | Nessuna (copyright riservato) | Il codice resta visibile pubblicamente ma nessuno ha il diritto legale di copiarlo/modificarlo/riusarlo senza permesso esplicito. Nota: su GitHub, a prescindere dalla licenza, solo il proprietario del repository può modificarlo direttamente; altri possono solo proporre modifiche tramite Pull Request, sempre soggette ad approvazione |
| **Package manager** | npm | Predefinito, il più diffuso, nessuna configurazione aggiuntiva richiesta |
| **Browser target** | Chrome/Chromium su Android | Alcune API (es. File System Access API) sono disponibili solo su browser basati su Chromium; il tablet target usa Chrome |
| **Documentazione** | Cartella `/docs` nel repository, un file Markdown per ogni feature | Documentazione versionata insieme al codice, scritta in stile didattico (spiegata come a chi non ha mai visto codice frontend) |

---

## 🌳 GitFlow

Schema classico:

- **`main`** → sempre in stato rilasciabile/stabile, collegato al deploy su GitHub Pages
- **`develop`** → branch di integrazione, base per lo sviluppo delle nuove feature
- **`feature/faseX_nome-feature`** → una branch per ogni funzionalità, creata da `develop`, con merge in `develop` al termine. Il numero di fase (`X`) fa riferimento alla roadmap in `03-roadmap-sviluppo.md` (es. `feature/fase1_app-shell`) — *vedi DIR-001 in `05-direttive-progetto.md`*
- **`fix/faseX_nome-fix`** → per bugfix su `develop`
- **`hotfix/nome-hotfix`** → per fix urgenti direttamente su `main`, poi riportati anche su `develop`
- *(In futuro, se necessario: `release/x.y.z` per preparare una versione prima del merge in `main`)*

### Convenzione messaggi di commit

Si adotta lo standard **Conventional Commits**, per rendere lo storico leggibile e coerente:

```
feat: aggiunge il selettore modalità di lettura
fix: corregge il calcolo della pagina corrente
docs: aggiunge documentazione fase 5
chore: aggiorna dipendenze
```

Prefissi principali: `feat` (nuova funzionalità), `fix` (correzione), `docs` (documentazione), `chore` (manutenzione/configurazione), `refactor` (modifica al codice senza cambiare il comportamento).

### Definizione di "fase completata"

Una fase della roadmap si considera completata quando:
1. Il codice funziona correttamente ed è stato testato manualmente sul tablet (o in locale, se non ancora rilevante)
2. Esiste il file di documentazione dedicato in `/docs`, scritto in stile didattico
3. Il codice è stato mergiato dalla branch `feature/...` in `develop`
4. La card corrispondente sulla board Kanban è spostata in *Fatto*

---

## ✅ Stato di avanzamento

- [x] Analisi funzionale completata
- [x] Stack tecnico definito
- [x] GitFlow definito
- [x] Roadmap delle fasi di sviluppo
- [x] Fase 0 — Setup repository (repo GitHub, scaffolding Vite+React, ESLint+Prettier, branch `main`/`develop`, GitHub Projects, labels)
- [x] Fase 1 — Struttura dell'app (shell)
- [x] Fase 2 — PWA di base
- [x] Fase 3 — Lettura di un singolo CBZ (proof of concept)
- [x] Fase 4 — Supporto CBR
- [ ] Fase 5 — Modalità di lettura — **prossimo step**
- [ ] Sviluppo feature per feature (Fasi 6-20)

---

*Documento vivo: verrà aggiornato ogni volta che verranno prese nuove decisioni o modificate quelle esistenti.*
