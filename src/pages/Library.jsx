import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUncategorizedCount, getChapterCount, getContinueTarget } from '../db.js';
import {
  isFileSystemAccessSupported,
  pickFiles,
  pickDirectory,
  SUPPORTED_FORMATS_LABEL,
} from '../fileAccess.js';
import { importHandles } from '../importFiles.js';
import { useChapterOpener } from '../useChapterOpener.js';
import Icon from '../components/Icon.jsx';
import Catalog from '../components/Catalog.jsx';
import Favorites from '../components/Favorites.jsx';
import ContinueCard from '../components/ContinueCard.jsx';
import ImportMenu from '../components/ImportMenu.jsx';
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

// La Libreria è ciò che si possiede (ADR-002): in cima, quando ci sono, una
// riga per riprendere la lettura e la coda "Da categorizzare"; poi il
// Catalogo con la sua ricerca; sotto, i Preferiti. "In corso di lettura" e
// "Ultimi letti" non sono più qui: stanno nella scheda Lettore.
function Library() {
  const { t } = useTranslation();
  // Solo quanti capitoli aspettano una categoria: la lista vera sta nella
  // pagina dedicata, qui basta il numero (una query con indice, Fase 30a).
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [chapterCount, setChapterCount] = useState(0);
  const [continueTarget, setContinueTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  // Esito dell'ultimo import — o null.
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

  const refresh = useCallback(async () => {
    const [pending, count, target] = await Promise.all([
      getUncategorizedCount(),
      getChapterCount(),
      getContinueTarget(),
    ]);
    setUncategorizedCount(pending);
    setChapterCount(count);
    setContinueTarget(target);
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

  // Se il file di "Continua a leggere" non c'è più, ricarica la Libreria: il
  // capitolo morto viene rimosso e la card si aggiorna.
  const { open: openChapter, notice: openNotice } = useChapterOpener({
    onFileGone: () => setCatalogVersion((version) => version + 1),
  });

  async function runPicker(picker) {
    setResult(null);
    setError(null);
    try {
      const handles = await picker();
      const summary = await importHandles(handles);
      await refresh();
      setResult(summary);
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
      <div className="library-header">
        <div className="page-heading">
          <span className="page-eyebrow" aria-hidden="true">
            蔵書
          </span>
          <h1>{t('library.title')}</h1>
        </div>
        <ImportMenu onPickFiles={() => runPicker(pickFiles)} onPickFolder={() => runPicker(pickDirectory)} />
      </div>

      {feedbackBlock}

      {continueTarget && (
        <div className="library-continue">
          <ContinueCard target={continueTarget} variant="compact" onOpen={openChapter} />
          {openNotice && (
            <p className="library-error" role="alert">
              {openNotice}
            </p>
          )}
        </div>
      )}

      {uncategorizedCount > 0 && (
        <Link to="/uncategorized" className="library-uncategorized-card">
          <span className="library-uncategorized-icon" aria-hidden="true">
            <Icon name="inbox" size={22} />
          </span>
          <span className="library-uncategorized-text">
            <strong>{t('library.uncategorizedCount', { count: uncategorizedCount })}</strong>
            <span>{t('library.uncategorizedCta')}</span>
          </span>
          <span className="library-uncategorized-arrow" aria-hidden="true">
            <Icon name="chevron" size={20} />
          </span>
        </Link>
      )}

      <section className="library-section" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">{t('library.catalogHeading')}</h2>
        <Catalog
          key={catalogVersion}
          onFavoriteChanged={() => setFavoritesVersion((version) => version + 1)}
          onProgressChanged={refresh}
        />
      </section>

      <Favorites
        key={favoritesVersion}
        onLibraryChanged={() => setCatalogVersion((version) => version + 1)}
      />
    </div>
  );
}

export default Library;
