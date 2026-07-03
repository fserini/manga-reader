# Manga Reader PWA — Gestione Cambiamenti in Corso d'Opera

> Come gestire nuove idee di feature o blocchi tecnici che emergono durante lo sviluppo, senza perdere il controllo della roadmap.

---

## 0. Approccio di lavoro: Kanban leggero (Agile)

Il progetto adotta i principi Agile in versione leggera, adatta a uno sviluppatore singolo (senza le cerimonie/ruoli di Scrum, pensati per i team):

- **Board Kanban** su **GitHub Projects**, collegata automaticamente alle Issues del repository
- Colonne: *Da fare* → *In corso* → *Fatto*
- Le card della board corrispondono alle fasi della roadmap (`03-roadmap-sviluppo.md`) e alle idee/backlog tracciate come Issue
- Nessuno sprint a tempo fisso: si passa alla fase successiva solo quando quella corrente è completa
- A fine fase, piccola "retrospettiva" informale: cosa ha funzionato, cosa no — eventuali correzioni finiscono nel file `05-direttive-progetto.md`

*(GitHub Projects verrà configurato e spiegato in dettaglio durante la Fase 0 — Setup del repository)*

## 1. Nuova idea di feature

**Regola base:** non si interrompe la fase in corso per implementarla subito.

Flusso:
1. L'idea viene annotata come **GitHub Issue**, con etichetta `idea`, e appare nella colonna *Da fare* della board Kanban
2. Al termine della fase corrente, prima di iniziare la successiva, si rivedono le Issue aperte
3. Se l'idea viene valutata positivamente, passa a etichetta `backlog` e viene inserita come nuova fase nella roadmap (`03-roadmap-sviluppo.md`), altrimenti resta in `idea`/backlog per una valutazione futura

*(Le GitHub Issues verranno spiegate in dettaglio durante la Fase 0 — Setup del repository)*

## 2. Blocco tecnico / cambio di rotta

**Regola base:** un cambiamento a una decisione tecnica già presa non si fa "al volo" — si documenta.

Flusso:
1. Si crea un file **ADR (Architecture Decision Record)** in `/docs/decisions/`, numerato progressivamente (`ADR-001`, `ADR-002`, ...)
2. Template minimo:

```markdown
# ADR-XXX: Titolo della decisione

**Data:** ...
**Contesto:** cosa è successo / perché il piano originale non ha funzionato
**Opzioni considerate:** alternative valutate
**Decisione presa:** cosa si fa
**Conseguenze:** cosa cambia nel progetto (es. aggiornamento di 02-analisi-tecnica.md)
```

3. Se la decisione modifica lo stack tecnico definito in `02-analisi-tecnica.md`, quel documento viene aggiornato di conseguenza

---

*Questo processo si applica sia a idee "positive" (nuove feature) sia a problemi tecnici imprevisti, mantenendo la roadmap sempre coerente con lo stato reale del progetto.*
