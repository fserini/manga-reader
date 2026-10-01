import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUncategorizedChapters, removeChapter } from '../db.js';
import { isFileDeletionSupported, deleteFileFromHandle } from '../fileAccess.js';
import CategorizeForm from '../components/CategorizeForm.jsx';
import DeleteDialog from '../components/DeleteDialog.jsx';
import './Uncategorized.css';

const canDeleteFiles = isFileDeletionSupported();

// Vista dedicata alla coda "Da categorizzare" (Fase 22): prima viveva per
// intero dentro la Libreria, dove con molti capitoli importati insieme
// diventava una lista interminabile sulla pagina principale. Qui la pagina
// principale resta sempre leggera (vedi il riquadro riepilogo in
// Library.jsx), e questa vista si apre solo quando serve davvero categorizzare.
function Uncategorized() {
  const { t } = useTranslation();
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  // Capitolo attualmente in fase di categorizzazione (mostra il form) — o null.
  const [categorizing, setCategorizing] = useState(null);
  // Capitolo in attesa di conferma rimozione (es. importato per errore) — o null.
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    setChapters(await getUncategorizedChapters());
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

  // Rimuove il capitolo dalla coda, importato per errore o duplicato: la
  // rimozione fisica del file è opzionale, come per Serie/Volumi/Capitoli già
  // categorizzati nel Catalogo (vedi DeleteDialog).
  async function runDelete(deletePhysical) {
    const target = deleting;
    setDeleteBusy(true);
    try {
      if (deletePhysical && target.handle) {
        await deleteFileFromHandle(target.handle);
      }
      await removeChapter(target.id);
      setDeleting(null);
      await refresh();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page">
      <Link to="/" className="uncategorized-back">
        {t('library.backToLibrary')}
      </Link>

      <div className="page-heading">
        <span className="page-eyebrow" aria-hidden="true">
          未分類
        </span>
        <h1>{t('library.uncategorizedHeading')}</h1>
      </div>

      {loading ? (
        <p>{t('library.loading')}</p>
      ) : chapters.length === 0 ? (
        <p className="library-empty-note">{t('library.noUncategorized')}</p>
      ) : (
        <ul className="uncategorized-list">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="uncategorized-item">
              <span className="uncategorized-icon" aria-hidden="true">
                📄
              </span>
              <span className="uncategorized-name">{chapter.fileName}</span>
              <button type="button" className="uncategorized-button" onClick={() => setCategorizing(chapter)}>
                {t('library.categorize')}
              </button>
              <button
                type="button"
                className="uncategorized-delete"
                aria-label={t('library.deleteUncategorized', { fileName: chapter.fileName })}
                onClick={() => setDeleting(chapter)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {categorizing && (
        <CategorizeForm
          chapter={categorizing}
          onCancel={() => setCategorizing(null)}
          onDone={() => {
            setCategorizing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          label={t('library.deleteUncategorizedLabel', { fileName: deleting.fileName })}
          canDeleteFiles={canDeleteFiles}
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onRemoveFromLibrary={() => runDelete(false)}
          onDeleteFiles={() => runDelete(true)}
        />
      )}
    </div>
  );
}

export default Uncategorized;
