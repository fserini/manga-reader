# Manga Reader PWA — Analisi Funzionale

> Documento di riepilogo delle decisioni funzionali prese in fase di pianificazione, prima dell'inizio dello sviluppo.

---

## 🎯 Obiettivo del progetto

Realizzare una **Progressive Web App (PWA)** per la lettura di manga in formato **CBZ** e **CBR**, utilizzabile su tablet Android, **100% offline**, sviluppata con **React**.

Il progetto ha anche una finalità didattica: verrà utilizzato per studiare React da zero (nessuna esperienza pregressa), con documentazione dettagliata che accompagna ogni feature sviluppata.

**Metodologia di sviluppo:** suddivisione in piccole fasi/step incrementali, ciascuna facilmente studiabile singolarmente.

---

## 1. Gestione Libreria

- Struttura gerarchica: **Serie → Volumi → Capitoli**
- **Import:**
  - Selezione file: sia file singoli/multipli, sia cartella intera
  - Flusso: import "grezzo" di tutti i file selezionati → i file finiscono in una sezione **"Da categorizzare"** → l'utente assegna Serie/Volume/Capitolo con calma, quando vuole
  - Rilevamento duplicati: se un file sembra già presente in libreria (stesso nome/stesso capitolo già categorizzato), l'import di quel file viene **bloccato** con avviso
- **Rimozione automatica** dei riferimenti a file non più trovati sul dispositivo (file spostati/cancellati esternamente)
- **Rimozione manuale** (Serie / Volume / Capitolo):
  - Popup di conferma **sempre presente** prima della rimozione
  - Ad ogni rimozione, scelta tra: *rimuovi solo dalla libreria* (file fisico resta sul tablet) oppure *elimina anche il file fisico* dal dispositivo
- *(Backlog futuro — non nell'MVP: riconoscimento automatico di serie/volume/capitolo via pattern/regex sui nomi file, con editor di pattern personalizzati e gestione eccezioni)*

## 2. Lettura

- Modalità di visualizzazione:
  - Pagina singola
  - Doppia pagina (spread)
  - Scroll verticale continuo (stile webtoon)
- Controlli di navigazione:
  - Tap sui bordi schermo → pagina precedente/successiva
  - Doppio tap → zoom
  - Tap al centro → mostra/nasconde l'interfaccia (lettura immersiva)
  - Pinch-to-zoom
- Orientamento libero: portrait e landscape, ruota liberamente col dispositivo

## 3. Progresso di lettura

- Tracking **automatico** dell'ultima pagina letta, per ogni capitolo
- Preferiti
- Sezione "in corso di lettura"
- Sezione "ultimi letti"

## 4. Ricerca & Organizzazione

- Ricerca testuale nella libreria
- Ordinamento (alfabetico, ultimi letti, ecc.)

## 5. Dati & Backup

- Export/import dei dati dell'app (libreria, progressi di lettura, preferiti) tramite file esportabile — funzione considerata essenziale, non rimandabile

## 6. Gestione errori

- Gestione robusta di file corrotti o non validi (CBZ/CBR danneggiati, immagini illeggibili), con messaggi d'errore chiari e user-friendly, fin dall'MVP
- Gestione errori anche in fase di import (file non riconosciuti come archivio valido)

## 7. UI/UX

- Tema chiaro/scuro, con toggle manuale (non automatico da sistema)
- i18n: italiano + inglese, selezionabile dall'utente

## 8. PWA

- Installabile sul tablet (icona home screen, avvio standalone come app nativa)
- 100% offline, nessuna dipendenza da connessione internet in uso
- Notifica/banner quando è disponibile una nuova versione dell'app

## 9. Formati supportati

- CBZ
- CBR

## 10. Fuori scope MVP (backlog futuro)

- Riconoscimento automatico di pattern nei nomi dei file (raggruppamento automatico capitoli → volumi)
- Statistiche di lettura (tempo speso, capitoli/volumi completati, ecc.) — esplicitamente non richieste

---

*Documento vivo: verrà aggiornato ogni volta che verranno prese nuove decisioni o modificate quelle esistenti.*
