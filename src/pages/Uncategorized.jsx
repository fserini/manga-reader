import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUncategorizedChapters, removeChapter } from '../db.js';
import { isFileDeletionSupported, deleteFileFromHandle } from '../fileAccess.js';
import CategorizeForm from '../components/CategorizeForm.jsx';
import BulkCategorizeForm from '../components/BulkCategorizeForm.jsx';
import DeleteDialog from '../components/DeleteDialog.jsx';
import Icon from '../components/Icon.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
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

  // Capitoli selezionati per la categorizzazione multipla (Fase 23, id) e
  // apertura del relativo form.
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // In ordine di nome file "naturale" (cap 2 prima di cap 10): con molti file
  // importati insieme è l'ordine in cui si vogliono categorizzare.
  const refresh = useCallback(async () => {
    const list = await getUncategorizedChapters();
    list.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
    setChapters(list);
    // Un capitolo categorizzato o rimosso non è più selezionato.
    setSelected((current) => {
      const present = new Set(list.map((chapter) => chapter.id));
      const kept = new Set([...current].filter((id) => present.has(id)));
      return kept.size === current.size ? current : kept;
    });
  }, []);

  function toggleSelected(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => (current.size === chapters.length ? new Set() : new Set(chapters.map((c) => c.id))));
  }

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
        <SkeletonList rows={6} label={t('library.loading')} />
      ) : chapters.length === 0 ? (
        <p className="library-empty-note">{t('library.noUncategorized')}</p>
      ) : (
        <>
        <label className="uncategorized-select-all">
          <input
            type="checkbox"
            checked={selected.size === chapters.length}
            ref={(input) => {
              if (input) input.indeterminate = selected.size > 0 && selected.size < chapters.length;
            }}
            onChange={toggleAll}
          />
          <span>{t('library.selectAll')}</span>
        </label>
        <ul className="uncategorized-list">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="uncategorized-item">
              <label className="uncategorized-select">
                <input type="checkbox" checked={selected.has(chapter.id)} onChange={() => toggleSelected(chapter.id)} />
                <span className="uncategorized-icon" aria-hidden="true">
                  <Icon name="file" size={20} />
                </span>
                <span className="uncategorized-name">{chapter.fileName}</span>
              </label>
              <button type="button" className="uncategorized-button" onClick={() => setCategorizing(chapter)}>
                {t('library.categorize')}
              </button>
              <button
                type="button"
                className="uncategorized-delete"
                aria-label={t('library.deleteUncategorized', { fileName: chapter.fileName })}
                onClick={() => setDeleting(chapter)}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      {selected.size > 0 && (
        <div className="uncategorized-bar" role="region" aria-label={t('library.selectionBarAria')}>
          <span className="uncategorized-bar-count">{t('library.selectedCount', { count: selected.size })}</span>
          <button type="button" className="uncategorized-bar-clear" onClick={() => setSelected(new Set())}>
            {t('library.clearSelection')}
          </button>
          <button type="button" className="uncategorized-button" onClick={() => setBulkOpen(true)}>
            {t('library.categorizeSelected')}
          </button>
        </div>
      )}

      {bulkOpen && (
        <BulkCategorizeForm
          chapters={chapters.filter((chapter) => selected.has(chapter.id))}
          onCancel={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            refresh();
          }}
        />
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
