# Manga Reader PWA — Direttive di Progetto

> Documento vivo. Ogni volta che una scelta (di codice, di organizzazione del progetto, di processo) non risulta corretta o gradita, viene registrata qui come regola da rispettare per il resto dello sviluppo. Consultare questo file prima di prendere decisioni analoghe in futuro.

---

## Come funziona questo documento

- Ogni direttiva ha una data, un contesto breve e la regola da seguire
- Le direttive **non vengono mai rimosse**, anche se in futuro superate da altre più specifiche: restano come storico delle decisioni prese
- In caso di conflitto tra una direttiva e una scelta tecnica precedente, questo documento ha la priorità

---

## Direttive registrate

### DIR-001 — Naming delle feature branch con numero di fase
**Data:** 2026-07-03
**Contesto:** La convenzione iniziale prevedeva `feature/nome-feature`. Durante la Fase 1 è stato scelto un pattern diverso, ritenuto più chiaro.
**Direttiva:** Tutte le branch `feature/` devono includere il numero di fase della roadmap, con il pattern `feature/faseX_nome-feature` (es. `feature/fase1_app-shell`). Lo stesso vale, per coerenza, anche per `fix/` e `hotfix/` quando applicabile a una fase specifica.

---

### Template per nuove direttive

```markdown
### DIR-XXX — Titolo breve
**Data:** ...
**Contesto:** cosa è successo / quale scelta non andava bene
**Direttiva:** la regola da seguire d'ora in poi
```
