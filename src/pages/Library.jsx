import { useCallback, useEffect, useState } from 'react';
import {
  getUncategorizedChapters,
  getChapterCount,
  importChapter,
  getChapterByFileName,
  setChapterHandle,
} from '../db.js';
import {
  isFileSystemAccessSupported,
  isArchiveFileName,
  pickFiles,
  pickDirectory,
} from '../fileAccess.js';
import { isValidArchive } from '../comicFile.js';
import CategorizeForm from '../components/CategorizeForm.jsx';
import Catalog from '../components/Catalog.jsx';
import ReadingSections from '../components/ReadingSections.jsx';
import Favorites from '../components/Favorites.jsx';
import './Library.css';

const supported = isFileSystemAccessSupported();

function Library() {
  const [uncategorized, setUncategorized] = useState([]);
  const [chapterCount, setChapterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Esito dell'ultimo import: { imported, duplicates, ignored } — o null.
  const [result, setResult] = useState(null);
  // Messaggio d'errore vero e proprio (accesso ai file fallito) — distinto
  // dall'esito normale di un import con duplicati saltati.
  const [error, setError] = useState(null);
  // Capitolo attualmente in fase di categorizzazione (mostra il form) — o null.
  const [categorizing, setCategorizing] = useState(null);
  // Cambia dopo ogni categorizzazione: usato come `key` del Catalogo per
  // forzarne il ri-montaggio (e quindi il ricaricamento dei dati).
  const [catalogVersion, setCatalogVersion] = useState(0);
  // Stesso trucco per i Preferiti: cambia quando un preferito viene
  // aggiunto/tolto dal Catalogo, così la sezione dedicata si aggiorna senza
  // dover far perdere al Catalogo il livello di navigazione in cui si trova.
  const [favoritesVersion, setFavoritesVersion] = useState(0);

  const refresh = useCallback(async () => {
    const [chapters, count] = await Promise.all([getUncategorizedChapters(), getChapterCount()]);
    setUncategorized(chapters);
    setChapterCount(count);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Prende un elenco di handle (da file o cartella), scarta i non-archivio,
  // blocca i duplicati (stesso nome file già collegato a un handle), scarta
  // gli archivi corrotti o senza immagini e importa il resto. La validazione
  // apre il file (senza estrarne le pagine, vedi isValidArchive) solo dopo
  // aver già escluso estensione sbagliata e duplicati — non ha senso pagare
  // il costo dell'apertura per un file che verrebbe comunque scartato.
  //
  // Un capitolo con lo stesso nome file può già esistere ma SENZA handle: è
  // il caso di un capitolo ripristinato da un backup (Fase 16), il cui
  // riferimento al file fisico non è mai esportabile. Invece di scartarlo
  // come duplicato, lo si ricollega aggiornando solo il suo handle.
  async function importHandles(handles) {
    let imported = 0;
    let relinked = 0;
    let duplicates = 0;
    let ignored = 0;
    let corrupted = 0;

    for (const handle of handles) {
      if (!isArchiveFileName(handle.name)) {
        ignored += 1;
        continue;
      }

      const existing = await getChapterByFileName(handle.name);
      if (existing && existing.handle) {
        duplicates += 1;
        continue;
      }

      const file = await handle.getFile();
      if (!(await isValidArchive(file))) {
        corrupted += 1;
        continue;
      }

      if (existing) {
        await setChapterHandle(existing.id, handle);
        relinked += 1;
        continue;
      }

      await importChapter({ fileName: handle.name, handle });
      imported += 1;
    }

    await refresh();
    setResult({ imported, relinked, duplicates, ignored, corrupted });
  }

  async function runPicker(picker) {
    setResult(null);
    setError(null);
    try {
      const handles = await picker();
      await importHandles(handles);
    } catch (err) {
      // L'utente ha chiuso il picker senza scegliere: non è un errore.
      if (err.name === 'AbortError') return;
      setError("Import non riuscito: qualcosa è andato storto durante l'accesso ai file.");
    }
  }

  // Blocco riepilogo condiviso tra la vista vuota e quella con contenuti:
  // avviso evidenziato se sono stati saltati dei duplicati, poi il conteggio.
  const feedbackBlock = (
    <>
      {error && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
      {result?.relinked > 0 && (
        <p className="library-notice" role="status">
          🔗 {result.relinked === 1
            ? '1 capitolo era in libreria senza il file collegato (es. da un backup ripristinato) ed è stato ricollegato.'
            : `${result.relinked} capitoli erano in libreria senza il file collegato (es. da un backup ripristinato) e sono stati ricollegati.`}
        </p>
      )}
      {result?.duplicates > 0 && (
        <p className="library-notice" role="status">
          ⚠ {result.duplicates === 1
            ? '1 file era già in libreria ed è stato saltato.'
            : `${result.duplicates} file erano già in libreria e sono stati saltati.`}
        </p>
      )}
      {result?.corrupted > 0 && (
        <p className="library-notice" role="status">
          ⚠ {result.corrupted === 1
            ? '1 file non è un archivio CBZ/CBR valido (o non contiene immagini) ed è stato saltato.'
            : `${result.corrupted} file non sono archivi CBZ/CBR validi (o non contengono immagini) e sono stati saltati.`}
        </p>
      )}
      {result && (
        <p className="library-feedback">
          Importati: {result.imported} · Ricollegati: {result.relinked} · Duplicati saltati:{' '}
          {result.duplicates} · Corrotti saltati: {result.corrupted} · Ignorati: {result.ignored}
        </p>
      )}
    </>
  );

  if (!supported) {
    return (
      <div className="page">
        <h1>Libreria</h1>
        <p className="library-error" role="alert">
          Questo browser non supporta l'accesso ai file necessario per importare i manga. Usa
          Chrome o Edge (anche su Android).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Libreria</h1>
        <p>Caricamento…</p>
      </div>
    );
  }

  // Libreria completamente vuota: invito all'import in evidenza al centro.
  if (chapterCount === 0) {
    return (
      <div className="page library-empty">
        <button type="button" className="library-empty-invite" onClick={() => runPicker(pickFiles)}>
          <span className="library-empty-icon" aria-hidden="true">
            ＋
          </span>
          <span className="library-empty-title">La tua libreria è vuota</span>
          <span className="library-empty-hint">Tocca per importare file CBZ o CBR</span>
        </button>
        <button type="button" className="library-link-button" onClick={() => runPicker(pickDirectory)}>
          …oppure importa un'intera cartella
        </button>
        {feedbackBlock}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Libreria</h1>

      <div className="library-actions">
        <button type="button" onClick={() => runPicker(pickFiles)}>
          Importa file
        </button>
        <button type="button" onClick={() => runPicker(pickDirectory)}>
          Importa cartella
        </button>
      </div>

      {feedbackBlock}

      <Favorites
        key={favoritesVersion}
        onLibraryChanged={() => setCatalogVersion((version) => version + 1)}
      />

      <ReadingSections onLibraryChanged={() => setCatalogVersion((version) => version + 1)} />

      <section className="library-section" aria-labelledby="uncategorized-heading">
        <h2 id="uncategorized-heading">Da categorizzare</h2>
        {uncategorized.length === 0 ? (
          <p className="library-empty-note">Nessun capitolo in attesa di categorizzazione.</p>
        ) : (
          <ul className="library-list">
            {uncategorized.map((chapter) => (
              <li key={chapter.id} className="library-list-item">
                <span className="library-file-icon" aria-hidden="true">
                  📄
                </span>
                <span className="library-file-name">{chapter.fileName}</span>
                <button
                  type="button"
                  className="library-categorize-button"
                  onClick={() => setCategorizing(chapter)}
                >
                  Categorizza
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="library-section" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Catalogo</h2>
        <Catalog
          key={catalogVersion}
          onFavoriteChanged={() => setFavoritesVersion((version) => version + 1)}
        />
      </section>

      {categorizing && (
        <CategorizeForm
          chapter={categorizing}
          onCancel={() => setCategorizing(null)}
          onDone={() => {
            setCategorizing(null);
            refresh();
            setCatalogVersion((version) => version + 1);
          }}
        />
      )}
    </div>
  );
}

export default Library;
