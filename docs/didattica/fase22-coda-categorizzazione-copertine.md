# Fase 22 — Coda di categorizzazione dedicata e copertine per livello

> Nasce da un primo uso reale dell'app: un import di una ventina di capitoli insieme ha reso la lista "Da categorizzare" un muro di righe sulla pagina principale della Libreria. Nella stessa occasione è emerso un secondo problema, puramente grafico: la stessa copertina (reale o segnaposto "dorso") appariva identica a livello Serie, Volume e Capitolo, rendendo i tre livelli di navigazione difficili da distinguere al tocco.

---

## 1. La coda di categorizzazione diventa una pagina a sé

### Prima

`Library.jsx` renderizzava per intero, dentro la pagina principale, un `<ul>` con **ogni singolo** capitolo in attesa di categorizzazione — nessun limite, nessuna paginazione. Con pochi file era un fastidio accettabile; con venti file importati insieme, la Libreria diventava quella lista, con il Catalogo spinto in fondo alla pagina.

### Dopo

La Libreria mostra solo un **riquadro riepilogo** compatto:

```jsx
{uncategorized.length > 0 && (
  <Link to="/uncategorized" className="library-uncategorized-card">
    …"14 capitoli da categorizzare"…
  </Link>
)}
```

Punto chiave: il riquadro **non esiste nel DOM** quando `uncategorized.length === 0` — niente nota vuota, niente placeholder. Una libreria senza nulla da categorizzare torna semplicemente alla Libreria + Catalogo, senza alcuna traccia della funzione.

La lista vera e propria — con il pulsante "Categorizza" per riga e il form di assegnazione (`CategorizeForm`, invariato) — si è spostata in un **componente di pagina dedicato**, `src/pages/Uncategorized.jsx`, raggiungibile dalla nuova rotta `/uncategorized` registrata in `App.jsx`:

```jsx
<Route path="/uncategorized" element={<Uncategorized />} />
```

### Perché una rotta e non, ad esempio, un modale a schermo intero

Una rotta vera dà "gratis" alcune cose che un modale dovrebbe gestire a mano:

- il tasto **indietro** del browser/Android funziona come ci si aspetta
- tornando alla Libreria (`<Link to="/">`), il componente `Library` viene **rimontato da zero**: il suo `useEffect` di caricamento riparte, quindi il riquadro riepilogo si aggiorna automaticamente senza bisogno di passarsi stato a mano tra le due pagine
- la Libreria resta un componente più semplice: non deve più sapere nulla della logica di categorizzazione, solo del conteggio

## 2. Copertine solo a livello Capitolo

### Il problema

Nel Catalogo (`Catalog.jsx`), lo stesso componente `Cover` veniva usato, con lo stesso CSS, a tutti e tre i livelli di navigazione (Serie → Volumi → Capitoli). Risultato: scorrendo i livelli, l'occhio vedeva sempre "la stessa cosa" — una griglia di rettangoli 2:3, con un segnaposto "dorso" (titolo in verticale) quando non c'era ancora un'immagine reale. Serie e Volumi, però, **non hanno mai un'immagine propria**: quel segnaposto era l'unica cosa che veniva mai mostrata a quei livelli, il che lo rendeva un travestimento piuttosto che un'anteprima.

### La scelta

Solo il **Capitolo** ha davvero una miniatura (la prima pagina dell'archivio, salvata in `chapter.thumbnail`), quindi è l'unico livello che conserva la griglia di copertine. Serie e Volumi diventano un **elenco testuale** — più vicino a un indice di libreria che a uno scaffale di copertine, il che è coerente con l'idea stessa di "livello di aggregazione" invece che "contenuto".

```jsx
// Capitolo (invariato): griglia con Cover
<ul className="catalog-grid">
  <li className="catalog-card">
    <Cover blob={chapter.thumbnail} title={...} />
    …
  </li>
</ul>

// Serie / Volume (nuovo): elenco testuale
<ul className="catalog-index">
  <li className="catalog-index-row">
    <button className="catalog-index-main">
      <span className="catalog-index-title">{item.title}</span>
    </button>
    <div className="catalog-index-actions">…preferito, rimuovi…</div>
  </li>
</ul>
```

Le azioni (preferito, rimozione) restano le stesse di prima: cambia solo che non sono più pulsanti assoluti sopra un'immagine, ma pulsanti normali in riga, perché non c'è più nessuna immagine sotto cui posizionarli.

## Cosa NON è cambiato

- La logica di categorizzazione (`CategorizeForm.jsx`, `categorizeChapter` in `db.js`) è identica: si è solo spostata la pagina che la ospita.
- Il Catalogo a livello Capitolo è pixel-identico a prima (stessa griglia, stesso componente `Cover`, stesso CSS).
- Nessuna migrazione dati: `categorized`/`coverThumbnail`/`thumbnail` nello schema Dexie non cambiano.

## 🩹 Ritocco dopo il primo feedback

La vista dedicata, nella prima versione, offriva solo "Categorizza" per riga: nessun modo di togliere dalla coda un capitolo importato per errore (es. un duplicato sfuggito al controllo nome-file, o un file sbagliato). Aggiunto un pulsante di rimozione per riga che riusa lo stesso `DeleteDialog` già visto nel Catalogo — mantieni il file fisico o eliminalo anche dal dispositivo — invece di inventare un flusso nuovo.

## Verifica

Verificato in sandbox popolando `IndexedDB` manualmente (niente file picker nativo in questo ambiente, quindi niente CBZ reali — vedi la stessa limitazione già incontrata in Fase 20):

- riquadro riepilogo presente con N > 0, assente con lista vuota
- `/uncategorized` elenca tutti i capitoli, apre `CategorizeForm`, torna alla Libreria dopo il salvataggio
- Catalogo: Serie e Volumi renderizzati come righe testuali (`catalog-index-row`), Capitoli come griglia con `Cover`/segnaposto (`catalog-grid` + `catalog-cover--placeholder`)

**Da verificare su dispositivo reale** (Federico, fuori sandbox): resa visiva effettiva del riquadro riepilogo e dell'elenco testuale su schermo touch; comportamento con un vero import massivo di capitoli CBZ/CBR.
