import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUncategorizedChapters } from '../db.js';
import CategorizeForm from '../components/CategorizeForm.jsx';
import './Uncategorized.css';

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
    </div>
  );
}

export default Uncategorized;
