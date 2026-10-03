import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkLibraryFiles } from '../fileCheck.js';
import { removeChapters } from '../db.js';
import './CategorizeForm.css';
import './FileCheckDialog.css';

// Quanti nomi di file mostrare nell'elenco dei mancanti: oltre, l'elenco
// diventerebbe un muro (se è saltata un'intera cartella, sono centinaia).
const MAX_LISTED = 8;

// Ricontrollo dei file collegati (Fase 26). Parte da solo all'apertura, mostra
// l'avanzamento, poi il riepilogo; se ci sono file mancanti offre di togliere i
// loro riferimenti dalla libreria (i file, che non ci sono, non si toccano).
// onChanged: chiamata dopo una rimozione, perché la Libreria si aggiorni.
function FileCheckDialog({ onClose, onChanged }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    checkLibraryFiles({
      onProgress: (value) => {
        if (!cancelled) setProgress(value);
      },
      isCancelled: () => cancelled,
    })
      .then((outcome) => {
        if (!cancelled) setResult(outcome);
      })
      .catch(() => {
        if (!cancelled) setError(t('fileCheck.error'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeChapters(result.missing.map((chapter) => chapter.id));
      setRemoved(result.missing.length);
      setResult({ ...result, missing: [] });
      onChanged();
    } catch {
      setError(t('fileCheck.removeError'));
    } finally {
      setRemoving(false);
    }
  }

  const checking = !result && !error;
  const allFine = result && result.missing.length === 0 && result.unverified === 0 && result.withoutHandle === 0;

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="filecheck-title">
      <div className="cf-panel">
        <h2 id="filecheck-title" className="cf-title">
          {t('fileCheck.title')}
        </h2>

        {checking && (
          <p role="status" className="filecheck-progress">
            {progress.total > 0
              ? t('fileCheck.progress', { done: progress.done, total: progress.total })
              : t('fileCheck.starting')}
          </p>
        )}

        {error && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="filecheck-result" role="status">
            {removed > 0 && <p className="cf-prefilled filecheck-removed">{t('fileCheck.removed', { count: removed })}</p>}

            {allFine && <p>{t('fileCheck.allFine', { count: result.ok })}</p>}

            {!allFine && (
              <>
                {result.ok > 0 && <p>{t('fileCheck.reachable', { count: result.ok })}</p>}

                {result.missing.length > 0 && (
                  <div className="filecheck-block">
                    <p className="filecheck-warning">{t('fileCheck.missing', { count: result.missing.length })}</p>
                    <ul className="filecheck-list">
                      {result.missing.slice(0, MAX_LISTED).map((chapter) => (
                        <li key={chapter.id}>{chapter.fileName}</li>
                      ))}
                    </ul>
                    {result.missing.length > MAX_LISTED && (
                      <p className="filecheck-more">{t('fileCheck.more', { count: result.missing.length - MAX_LISTED })}</p>
                    )}
                    <p className="filecheck-note">{t('fileCheck.removeNote')}</p>
                  </div>
                )}

                {result.unverified > 0 && (
                  <p className="filecheck-note">{t('fileCheck.unverified', { count: result.unverified })}</p>
                )}
                {result.withoutHandle > 0 && (
                  <p className="filecheck-note">{t('fileCheck.withoutHandle', { count: result.withoutHandle })}</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="cf-actions">
          {result && result.missing.length > 0 && (
            <button type="button" className="cf-save filecheck-danger" onClick={handleRemove} disabled={removing}>
              {t('fileCheck.remove', { count: result.missing.length })}
            </button>
          )}
          <button type="button" className="cf-cancel" onClick={onClose} disabled={removing}>
            {t('fileCheck.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FileCheckDialog;
