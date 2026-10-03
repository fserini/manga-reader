import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getInProgressChapters, getRecentlyReadChapters, clearReadingProgress } from '../db.js';
import { useChapterOpener } from '../useChapterOpener.js';
import { useObjectUrl } from '../useObjectUrl.js';
import { chapterLabel } from '../chapterLabel.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';
import './ReadingSections.css';

function completionPercent(item) {
  if (!item.totalPages) return 0;
  return Math.round(((item.lastPageRead + 1) / item.totalPages) * 100);
}

// Miniatura di un elemento, con URL oggetto gestito (come nel Catalogo).
function ItemCover({ blob }) {
  const url = useObjectUrl(blob);

  if (!url) {
    return (
      <div className="rs-cover rs-cover--placeholder" aria-hidden="true">
        <Icon name="reader" size={36} />
      </div>
    );
  }
  return <img className="rs-cover" src={url} alt="" />;
}

// "In corso di lettura" e "Ultimi letti": dal 29b vivono nella scheda Lettore
// (ADR-002), non più in Libreria. onChanged: chiamata dopo una rimozione
// manuale, perché chi la ospita possa aggiornare ciò che dipende dallo stesso
// progresso (la card "Continua a leggere").
function ReadingSections({ onChanged }) {
  const { t } = useTranslation();
  const [inProgress, setInProgress] = useState([]);
  const [recent, setRecent] = useState([]);
  // Capitolo in attesa di conferma per la rimozione manuale (dalle liste, non
  // dalla libreria) — o null.
  const [removing, setRemoving] = useState(null);
  const { open, notice } = useChapterOpener();

  const loadSections = useCallback(async () => {
    const [progressItems, recentItems] = await Promise.all([
      getInProgressChapters(),
      getRecentlyReadChapters(),
    ]);
    return { progressItems, recentItems };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { progressItems, recentItems } = await loadSections();
      if (cancelled) return;
      setInProgress(progressItems);
      setRecent(recentItems);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSections]);

  // Rimuove solo il progresso (vedi clearReadingProgress in db.js): il
  // capitolo resta in libreria, esce solo da queste due sezioni.
  async function confirmRemove() {
    await clearReadingProgress(removing.chapterId);
    setRemoving(null);
    const { progressItems, recentItems } = await loadSections();
    setInProgress(progressItems);
    setRecent(recentItems);
    onChanged?.();
  }

  function renderList(items, withProgress) {
    return (
      <ul className="rs-row">
        {items.map((item) => (
          <li key={item.chapterId}>
            <button type="button" className="rs-card" onClick={() => open(item)}>
              <ItemCover blob={item.thumbnail} />
              <span className="rs-card-title">
                {item.seriesTitle ? `${item.seriesTitle} · ` : ''}
                {chapterLabel(item, t)}
              </span>
              {item.volumeNumber != null && (
                <span className="rs-card-sub">{t('readingSections.volumeSub', { number: item.volumeNumber })}</span>
              )}
              {withProgress && (
                <span className="rs-progress" aria-label={t('readingSections.progressAria', { percent: completionPercent(item) })}>
                  <span className="rs-progress-bar" style={{ width: `${completionPercent(item)}%` }} />
                </span>
              )}
            </button>
            <button
              type="button"
              className="rs-remove"
              aria-label={t('readingSections.removeAria', { label: chapterLabel(item, t) })}
              onClick={() => setRemoving(item)}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (inProgress.length === 0 && recent.length === 0) return null;

  return (
    <div className="reading-sections">
      {notice && (
        <p className="rs-notice" role="alert">
          {notice}
        </p>
      )}

      {inProgress.length > 0 && (
        <section aria-labelledby="in-progress-heading">
          <h2 id="in-progress-heading">{t('readingSections.inProgressHeading')}</h2>
          {renderList(inProgress, true)}
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading">{t('readingSections.recentHeading')}</h2>
          {renderList(recent, false)}
        </section>
      )}

      {removing && (
        <ConfirmDialog
          title={t('readingSections.removeTitle', { label: chapterLabel(removing, t) })}
          note={t('readingSections.removeNote')}
          confirmLabel={t('readingSections.remove')}
          cancelLabel={t('readingSections.cancel')}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

export default ReadingSections;
