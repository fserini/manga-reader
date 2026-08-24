import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getInProgressChapters, getRecentlyReadChapters } from '../db.js';
import { verifyPermission, fileStillExists } from '../fileAccess.js';
import './ReadingSections.css';

function completionPercent(item) {
  if (!item.totalPages) return 0;
  return Math.round(((item.lastPageRead + 1) / item.totalPages) * 100);
}

// Miniatura di un elemento, con URL oggetto gestito (come nel Catalogo).
function ItemCover({ blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!url) {
    return (
      <div className="rs-cover rs-cover--placeholder" aria-hidden="true">
        📖
      </div>
    );
  }
  return <img className="rs-cover" src={url} alt="" />;
}

function ReadingSections({ onLibraryChanged }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [inProgress, setInProgress] = useState([]);
  const [recent, setRecent] = useState([]);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [progressItems, recentItems] = await Promise.all([
        getInProgressChapters(),
        getRecentlyReadChapters(),
      ]);
      if (!cancelled) {
        setInProgress(progressItems);
        setRecent(recentItems);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Come nel Catalogo: permesso durante il gesto, poi apertura. Se il file non
  // c'è più, avvisa e chiede alla Libreria di aggiornarsi.
  async function openItem(item) {
    setNotice(null);
    if (!item.handle) {
      setNotice(t('readingSections.notice.fileUnavailable'));
      return;
    }
    try {
      const granted = await verifyPermission(item.handle, 'read');
      if (!granted) {
        setNotice(t('readingSections.notice.permissionDenied'));
        return;
      }
      if (!(await fileStillExists(item.handle))) {
        setNotice(t('readingSections.notice.fileGone'));
        onLibraryChanged?.();
        return;
      }
      navigate(`/reader/${item.chapterId}`);
    } catch {
      setNotice(t('readingSections.notice.accessError'));
    }
  }

  function renderList(items, withProgress) {
    return (
      <ul className="rs-row">
        {items.map((item) => (
          <li key={item.chapterId}>
            <button type="button" className="rs-card" onClick={() => openItem(item)}>
              <ItemCover blob={item.thumbnail} />
              <span className="rs-card-title">
                {item.seriesTitle ? `${item.seriesTitle} · ` : ''}
                {t('readingSections.chapterLabel', { number: item.chapterNumber })}
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
    </div>
  );
}

export default ReadingSections;
