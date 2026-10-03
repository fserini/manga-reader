import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  getFileExtension,
  pickFiles,
  pickDirectory,
  SUPPORTED_FORMATS_LABEL,
} from '../fileAccess.js';
import { validateArchive } from '../comicFile.js';
import Icon from '../components/Icon.jsx';
import Catalog from '../components/Catalog.jsx';
import ReadingSections from '../components/ReadingSections.jsx';
import Favorites from '../components/Favorites.jsx';
import './Library.css';

const supported = isFileSystemAccessSupported();
const MAX_LISTED_TYPES = 4;

// Avviso evidenziato dopo un import (duplicati saltati, formati non
// supportati...): un'icona e il testo, allineati.
function Notice({ icon = 'alert', children }) {
  return (
    <p className="library-notice" role="status">
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </p>
  );
}

// ".pdf, .epub" — le estensioni dei file saltati, per dire quali formati non
// sono supportati senza riempire l'avviso se ce ne sono molti.
function describeExtensions(extensions) {
  const labels = extensions.map((extension) => (extension ? `.${extension}` : '—'));
  const shown = labels.slice(0, MAX_LISTED_TYPES).join(', ');
  return labels.length > MAX_LISTED_TYPES ? `${shown}…` : shown;
}

function Library() {
  const { t } = useTranslation();
  const [uncategorized, setUncategorized] = useState([]);
  const [chapterCount, setChapterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // Esito dell'ultimo import: { imported, duplicates, ignored } — o null.
  const [result, setResult] = useState(null);
  // Messaggio d'errore vero e proprio (accesso ai file fallito) — distinto
  // dall'esito normale di un import con duplicati saltati.
  const [error, setError] = useState(null);
  // Cambia dopo ogni categorizzazione: usato come `key` del Catalogo per
  // forzarne il ri-montaggio (e quindi il ricaricamento dei dati).
  const [catalogVersion, setCatalogVersion] = useState(0);
  // Stesso trucco per i Preferiti: cambia quando un preferito viene
  // aggiunto/tolto dal Catalogo, così la sezione dedicata si aggiorna senza
  // dover far perdere al Catalogo il livello di navigazione in cui si trova.
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  // E per "In corso di lettura"/"Ultimi letti": cambia quando il Catalogo
  // segna un volume come letto (o non letto), che sposta capitoli da lì.
  const [readingVersion, setReadingVersion] = useState(0);

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

  // Prende un elenco di handle (da file o cartella), scarta i formati non
  // supportati (ricordandone le estensioni, per avvisare), blocca i duplicati
  // (stesso nome file già collegato a un handle), scarta gli archivi non
  // leggibili (corrotti, senza immagini, con password) e importa il resto. La
  // validazione apre il file (senza estrarne le pagine, vedi validateArchive)
  // solo dopo aver già escluso estensione sbagliata e duplicati — non ha
  // senso pagare il costo dell'apertura per un file che verrebbe comunque
  // scartato.
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
    const failures = { invalid: 0, encrypted: 0, timeout: 0 };
    const unsupportedTypes = new Set();

    for (const handle of handles) {
      if (!isArchiveFileName(handle.name)) {
        ignored += 1;
        unsupportedTypes.add(getFileExtension(handle.name));
        continue;
      }

      const existing = await getChapterByFileName(handle.name);
      if (existing && existing.handle) {
        duplicates += 1;
        continue;
      }

      const file = await handle.getFile();
      const verdict = await validateArchive(file);
      if (verdict !== 'ok') {
        failures[verdict] += 1;
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
    setResult({
      imported,
      relinked,
      duplicates,
      ignored,
      unreadable: failures.invalid + failures.encrypted + failures.timeout,
      invalid: failures.invalid,
      encrypted: failures.encrypted,
      timeout: failures.timeout,
      unsupportedTypes: [...unsupportedTypes],
    });
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
      setError(t('library.importError'));
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
        <Notice icon="link">{t('library.notice.relinked', { count: result.relinked })}</Notice>
      )}
      {result?.duplicates > 0 && <Notice>{t('library.notice.duplicates', { count: result.duplicates })}</Notice>}
      {result?.ignored > 0 && (
        <Notice>
          {t('library.notice.unsupported', {
            count: result.ignored,
            types: describeExtensions(result.unsupportedTypes),
            formats: SUPPORTED_FORMATS_LABEL,
          })}
          {result.unsupportedTypes.includes('pdf') && <> {t('library.notice.pdfSoon')}</>}
        </Notice>
      )}
      {result?.invalid > 0 && <Notice>{t('library.notice.corrupted', { count: result.invalid })}</Notice>}
      {result?.encrypted > 0 && <Notice>{t('library.notice.encrypted', { count: result.encrypted })}</Notice>}
      {result?.timeout > 0 && <Notice>{t('library.notice.timeout', { count: result.timeout })}</Notice>}
      {result && <p className="library-feedback">{t('library.feedback', result)}</p>}
    </>
  );

  if (!supported) {
    return (
      <div className="page">
        <h1>{t('library.title')}</h1>
        <p className="library-error" role="alert">
          {t('library.unsupportedBrowser')}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <h1>{t('library.title')}</h1>
        <p>{t('library.loading')}</p>
      </div>
    );
  }

  // Libreria completamente vuota: invito all'import in evidenza al centro.
  if (chapterCount === 0) {
    return (
      <div className="page library-empty">
        <button type="button" className="library-empty-invite" onClick={() => runPicker(pickFiles)}>
          <span className="library-empty-icon" aria-hidden="true">
            <Icon name="plus" size={44} />
          </span>
          <span className="library-empty-title">{t('library.emptyTitle')}</span>
          <span className="library-empty-hint">{t('library.emptyHint', { formats: SUPPORTED_FORMATS_LABEL })}</span>
        </button>
        <button type="button" className="library-link-button" onClick={() => runPicker(pickDirectory)}>
          {t('library.importFolderLink')}
        </button>
        {feedbackBlock}
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t('library.title')}</h1>

      <div className="library-actions">
        <button type="button" onClick={() => runPicker(pickFiles)}>
          {t('library.importFiles')}
        </button>
        <button type="button" onClick={() => runPicker(pickDirectory)}>
          {t('library.importFolder')}
        </button>
      </div>

      {feedbackBlock}

      <Favorites
        key={favoritesVersion}
        onLibraryChanged={() => setCatalogVersion((version) => version + 1)}
      />

      <ReadingSections
        key={readingVersion}
        onLibraryChanged={() => setCatalogVersion((version) => version + 1)}
      />

      {uncategorized.length > 0 && (
        <Link to="/uncategorized" className="library-uncategorized-card">
          <span className="library-uncategorized-icon" aria-hidden="true">
            <Icon name="inbox" size={22} />
          </span>
          <span className="library-uncategorized-text">
            <strong>{t('library.uncategorizedCount', { count: uncategorized.length })}</strong>
            <span>{t('library.uncategorizedCta')}</span>
          </span>
          <span className="library-uncategorized-arrow" aria-hidden="true">
            <Icon name="chevron" size={20} />
          </span>
        </Link>
      )}

      <section className="library-section" aria-labelledby="catalog-heading">
        <div className="page-heading">
          <span className="page-eyebrow" aria-hidden="true">蔵書</span>
          <h2 id="catalog-heading">{t('library.catalogHeading')}</h2>
        </div>
        <Catalog
          key={catalogVersion}
          onFavoriteChanged={() => setFavoritesVersion((version) => version + 1)}
          onProgressChanged={() => setReadingVersion((version) => version + 1)}
        />
      </section>
    </div>
  );
}

export default Library;
