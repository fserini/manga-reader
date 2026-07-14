import { useCallback, useEffect, useState } from 'react';
import {
  getUncategorizedChapters,
  getChapterCount,
  importChapter,
  chapterExistsByFileName,
} from '../db.js';
import {
  isFileSystemAccessSupported,
  isArchiveFileName,
  pickFiles,
  pickDirectory,
} from '../fileAccess.js';
import CategorizeForm from '../components/CategorizeForm.jsx';
import Catalog from '../components/Catalog.jsx';
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
  // blocca i duplicati (stesso nome file già in libreria) e importa il resto.
  async function importHandles(handles) {
    let imported = 0;
    let duplicates = 0;
    let ignored = 0;

    for (const handle of handles) {
      if (!isArchiveFileName(handle.name)) {
        ignored += 1;
        continue;
      }
      if (await chapterExistsByFileName(handle.name)) {
        duplicates += 1;
        continue;
      }
      await importChapter({ fileName: handle.name, handle });
      imported += 1;
    }

    await refresh();
    setResult({ imported, duplicates, ignored });
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
      {result?.duplicates > 0 && (
        <p className="library-notice" role="status">
          ⚠ {result.duplicates === 1
            ? '1 file era già in libreria ed è stato saltato.'
            : `${result.duplicates} file erano già in libreria e sono stati saltati.`}
        </p>
      )}
      {result && (
        <p className="library-feedback">
          Importati: {result.imported} · Duplicati saltati: {result.duplicates} · Ignorati:{' '}
          {result.ignored}
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
        <Catalog key={catalogVersion} />
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
