import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getAllSeries,
  getVolumesForSeries,
  getChaptersForVolume,
  getChaptersUnderSeries,
  getChaptersUnderVolume,
  getReadingProgressMap,
  getSeriesLastReadMap,
  removeSeries,
  removeVolume,
  removeChapter,
  toggleSeriesFavorite,
  toggleVolumeFavorite,
  toggleChapterFavorite,
} from '../db.js';
import {
  verifyPermission,
  fileStillExists,
  isFileDeletionSupported,
  deleteFileFromHandle,
} from '../fileAccess.js';
import DeleteDialog from './DeleteDialog.jsx';
import './Catalog.css';

const canDeleteFiles = isFileDeletionSupported();

function isCompleted(progress) {
  return Boolean(progress && progress.totalPages > 0 && progress.lastPageRead >= progress.totalPages - 1);
}

function completionPercent(progress) {
  if (!progress || !progress.totalPages) return 0;
  return Math.round(((progress.lastPageRead + 1) / progress.totalPages) * 100);
}

// Mostra una miniatura da un Blob (creando/revocando l'URL oggetto), oppure un
// segnaposto se la copertina non è ancora disponibile.
function Cover({ blob, alt }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!url) {
    return (
      <div className="catalog-cover catalog-cover--placeholder" aria-hidden="true">
        📖
      </div>
    );
  }
  return <img className="catalog-cover" src={url} alt={alt} />;
}

// onFavoriteChanged: chiamata dopo ogni cambio di preferito, così la Libreria
// può aggiornare la sezione dedicata (che vive in un componente sorella,
// separato per non perdere il livello di navigazione corrente qui dentro).
function Catalog({ onFavoriteChanged }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [series, setSeries] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Progresso di lettura dei capitoli mostrati {chapterId: progress} e statistiche
  // per volume {volumeId: {read, total}} per gli indicatori di completamento.
  const [progressMap, setProgressMap] = useState({});
  const [volumeStats, setVolumeStats] = useState({});

  // Livello di navigazione corrente e le voci selezionate lungo il percorso.
  const [level, setLevel] = useState('series'); // 'series' | 'volumes' | 'chapters'
  const [currentSeries, setCurrentSeries] = useState(null);
  const [currentVolume, setCurrentVolume] = useState(null);

  // Ricerca testuale (si applica all'elenco del livello corrente) e
  // ordinamento delle serie. seriesLastRead è {seriesId: lastReadAt}, per
  // l'ordinamento "ultimi letti".
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title'); // 'title' | 'recent'
  const [seriesLastRead, setSeriesLastRead] = useState({});

  const [notice, setNotice] = useState(null);
  // Elemento in attesa di conferma rimozione: { kind, item, label, note } o null.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, lastRead] = await Promise.all([getAllSeries(), getSeriesLastReadMap()]);
      if (!cancelled) {
        setSeries(list);
        setSeriesLastRead(lastRead);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Calcola, per ogni volume di una serie, quanti capitoli risultano completati.
  async function loadVolumeStats(volumeList) {
    const stats = {};
    await Promise.all(
      volumeList.map(async (volume) => {
        const volumeChapters = await getChaptersForVolume(volume.id);
        const map = await getReadingProgressMap(volumeChapters.map((chapter) => chapter.id));
        const read = volumeChapters.filter((chapter) => isCompleted(map[chapter.id])).length;
        stats[volume.id] = { read, total: volumeChapters.length };
      }),
    );
    return stats;
  }

  // Ricarica l'elenco del livello attualmente mostrato, dopo una rimozione.
  async function reloadCurrentLevel() {
    if (level === 'series') {
      setSeries(await getAllSeries());
      setSeriesLastRead(await getSeriesLastReadMap());
    } else if (level === 'volumes' && currentSeries) {
      const volumeList = await getVolumesForSeries(currentSeries.id);
      setVolumes(volumeList);
      setVolumeStats(await loadVolumeStats(volumeList));
    } else if (level === 'chapters' && currentVolume) {
      const chapterList = await getChaptersForVolume(currentVolume.id);
      setChapters(chapterList);
      setProgressMap(await getReadingProgressMap(chapterList.map((chapter) => chapter.id)));
    }
  }

  async function openSeries(item) {
    setCurrentSeries(item);
    const volumeList = await getVolumesForSeries(item.id);
    setVolumes(volumeList);
    setVolumeStats(await loadVolumeStats(volumeList));
    setLevel('volumes');
    setSearchQuery('');
  }

  async function openVolume(volume) {
    setCurrentVolume(volume);
    const chapterList = await getChaptersForVolume(volume.id);
    setChapters(chapterList);
    setProgressMap(await getReadingProgressMap(chapterList.map((chapter) => chapter.id)));
    setLevel('chapters');
    setSearchQuery('');
  }

  // Il permesso di lettura sull'handle va (ri)chiesto durante un gesto utente:
  // lo facciamo qui, nel gestore del tocco, prima di aprire il Lettore. Se il
  // file non esiste più, rimuoviamo automaticamente il riferimento morto.
  async function openChapter(chapter) {
    setNotice(null);
    try {
      const granted = await verifyPermission(chapter.handle, 'read');
      if (!granted) {
        setNotice(t('catalog.permissionDenied'));
        return;
      }
      if (!(await fileStillExists(chapter.handle))) {
        await removeChapter(chapter.id);
        await reloadCurrentLevel();
        setNotice(t('catalog.fileGoneRemoved'));
        return;
      }
      navigate(`/reader/${chapter.id}`);
    } catch {
      setNotice(t('catalog.accessError'));
    }
  }

  function goToSeries() {
    setLevel('series');
    setCurrentSeries(null);
    setCurrentVolume(null);
    setSearchQuery('');
  }

  function goToVolumes() {
    setLevel('volumes');
    setCurrentVolume(null);
    setSearchQuery('');
  }

  function askDelete(kind, item, label, note) {
    setNotice(null);
    setDeleteTarget({ kind, item, label, note });
  }

  const FAVORITE_TOGGLES = {
    series: toggleSeriesFavorite,
    volume: toggleVolumeFavorite,
    chapter: toggleChapterFavorite,
  };

  async function toggleFavorite(kind, id) {
    await FAVORITE_TOGGLES[kind](id);
    await reloadCurrentLevel();
    onFavoriteChanged?.();
  }

  // Raccoglie gli handle di tutti i file coinvolti dalla rimozione (per la
  // cancellazione fisica). Va fatto PRIMA di rimuovere dal DB.
  async function collectHandles({ kind, item }) {
    if (kind === 'chapter') return item.handle ? [item.handle] : [];
    const chaptersUnder =
      kind === 'series' ? await getChaptersUnderSeries(item.id) : await getChaptersUnderVolume(item.id);
    return chaptersUnder.map((chapter) => chapter.handle).filter(Boolean);
  }

  async function removeFromDb({ kind, item }) {
    if (kind === 'series') return removeSeries(item.id);
    if (kind === 'volume') return removeVolume(item.id);
    return removeChapter(item.id);
  }

  async function runDelete(deletePhysical) {
    const target = deleteTarget;
    setDeleteBusy(true);
    let filesFailed = 0;

    try {
      if (deletePhysical) {
        const handles = await collectHandles(target);
        for (const handle of handles) {
          try {
            const deleted = await deleteFileFromHandle(handle);
            if (!deleted) filesFailed += 1;
          } catch {
            filesFailed += 1;
          }
        }
      }

      await removeFromDb(target);
      await reloadCurrentLevel();
      setDeleteTarget(null);

      if (deletePhysical && filesFailed > 0) {
        setNotice(t('catalog.deleteFailed', { count: filesFailed }));
      }
    } catch {
      setNotice(t('catalog.deleteError'));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return <p className="catalog-empty">{t('catalog.loading')}</p>;
  }

  if (series.length === 0) {
    return <p className="catalog-empty">{t('catalog.empty')}</p>;
  }

  // Filtro testuale e ordinamento: pura trasformazione degli elenchi già
  // caricati, ricalcolata ad ogni render — nessuno stato/effetto dedicato,
  // sono pochi elementi e il calcolo è economico.
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleSeries = series
    .filter((item) => !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery))
    .sort((a, b) =>
      sortBy === 'recent'
        ? (seriesLastRead[b.id] ?? 0) - (seriesLastRead[a.id] ?? 0)
        : a.title.localeCompare(b.title, undefined, { numeric: true }),
    );

  const visibleVolumes = volumes.filter(
    (volume) =>
      !normalizedQuery || t('catalog.volumeLabel', { number: volume.number }).toLowerCase().includes(normalizedQuery),
  );

  const visibleChapters = chapters.filter(
    (chapter) =>
      !normalizedQuery ||
      t('catalog.chapterLabel', { number: chapter.number }).toLowerCase().includes(normalizedQuery),
  );

  const currentLevelLabel = t(`catalog.level.${level}`);

  return (
    <div className="catalog">
      <nav className="catalog-breadcrumb" aria-label={t('catalog.path')}>
        <button type="button" className="catalog-crumb" onClick={goToSeries} disabled={level === 'series'}>
          {t('catalog.root')}
        </button>
        {currentSeries && (
          <>
            <span className="catalog-crumb-sep">/</span>
            <button
              type="button"
              className="catalog-crumb"
              onClick={goToVolumes}
              disabled={level === 'volumes'}
            >
              {currentSeries.title}
            </button>
          </>
        )}
        {currentVolume && (
          <>
            <span className="catalog-crumb-sep">/</span>
            <span className="catalog-crumb catalog-crumb--current">
              {t('catalog.volumeLabel', { number: currentVolume.number })}
            </span>
          </>
        )}
      </nav>

      <div className="catalog-toolbar">
        <input
          type="search"
          className="catalog-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('catalog.searchPlaceholder', { level: currentLevelLabel })}
          aria-label={t('catalog.searchAria', { level: currentLevelLabel })}
        />
        {level === 'series' && (
          <select
            className="catalog-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label={t('catalog.sortAria')}
          >
            <option value="title">{t('catalog.sortAlphabetical')}</option>
            <option value="recent">{t('catalog.sortRecent')}</option>
          </select>
        )}
      </div>

      {notice && (
        <p className="catalog-error" role="alert">
          {notice}
        </p>
      )}

      {normalizedQuery &&
        ((level === 'series' && visibleSeries.length === 0) ||
          (level === 'volumes' && visibleVolumes.length === 0) ||
          (level === 'chapters' && visibleChapters.length === 0)) && (
          <p className="catalog-empty">{t('catalog.noResults', { query: searchQuery.trim() })}</p>
        )}

      {level === 'series' && (
        <ul className="catalog-grid">
          {visibleSeries.map((item) => (
            <li key={item.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openSeries(item)}>
                <Cover blob={item.coverThumbnail} alt="" />
                <span className="catalog-card-title">{item.title}</span>
              </button>
              <button
                type="button"
                className="catalog-card-favorite"
                aria-label={
                  item.favorite
                    ? t('catalog.removeFavorite', { title: item.title })
                    : t('catalog.addFavorite', { title: item.title })
                }
                aria-pressed={Boolean(item.favorite)}
                onClick={() => toggleFavorite('series', item.id)}
              >
                {item.favorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={t('catalog.deleteSeries', { title: item.title })}
                onClick={() =>
                  askDelete(
                    'series',
                    item,
                    t('catalog.deleteSeriesLabel', { title: item.title }),
                    t('catalog.deleteSeriesNote'),
                  )
                }
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'volumes' && (
        <ul className="catalog-grid">
          {visibleVolumes.map((volume) => (
            <li key={volume.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openVolume(volume)}>
                <Cover blob={volume.coverThumbnail} alt="" />
                <span className="catalog-card-title">{t('catalog.volumeLabel', { number: volume.number })}</span>
                {volumeStats[volume.id] && volumeStats[volume.id].total > 0 && (
                  <span className="catalog-card-sub">
                    {t('catalog.readCount', {
                      read: volumeStats[volume.id].read,
                      total: volumeStats[volume.id].total,
                    })}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="catalog-card-favorite"
                aria-label={
                  volume.favorite
                    ? t('catalog.removeFavoriteVolume', { number: volume.number })
                    : t('catalog.addFavoriteVolume', { number: volume.number })
                }
                aria-pressed={Boolean(volume.favorite)}
                onClick={() => toggleFavorite('volume', volume.id)}
              >
                {volume.favorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={t('catalog.deleteVolume', { number: volume.number })}
                onClick={() =>
                  askDelete(
                    'volume',
                    volume,
                    t('catalog.deleteVolumeLabel', { number: volume.number }),
                    t('catalog.deleteVolumeNote'),
                  )
                }
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'chapters' && (
        <ul className="catalog-grid">
          {visibleChapters.map((chapter) => (
            <li key={chapter.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openChapter(chapter)}>
                <Cover blob={chapter.thumbnail} alt="" />
                <span className="catalog-card-title">{t('catalog.chapterLabel', { number: chapter.number })}</span>
                {isCompleted(progressMap[chapter.id]) ? (
                  <span className="catalog-card-sub catalog-card-sub--done">{t('catalog.done')}</span>
                ) : progressMap[chapter.id] ? (
                  <span
                    className="catalog-progress"
                    aria-label={t('catalog.progressAria', { percent: completionPercent(progressMap[chapter.id]) })}
                  >
                    <span
                      className="catalog-progress-bar"
                      style={{ width: `${completionPercent(progressMap[chapter.id])}%` }}
                    />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="catalog-card-favorite"
                aria-label={
                  chapter.favorite
                    ? t('catalog.removeFavoriteChapter', { number: chapter.number })
                    : t('catalog.addFavoriteChapter', { number: chapter.number })
                }
                aria-pressed={Boolean(chapter.favorite)}
                onClick={() => toggleFavorite('chapter', chapter.id)}
              >
                {chapter.favorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={t('catalog.deleteChapter', { number: chapter.number })}
                onClick={() => askDelete('chapter', chapter, t('catalog.deleteChapterLabel', { number: chapter.number }), null)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <DeleteDialog
          label={deleteTarget.label}
          note={deleteTarget.note}
          canDeleteFiles={canDeleteFiles}
          busy={deleteBusy}
          onCancel={() => setDeleteTarget(null)}
          onRemoveFromLibrary={() => runDelete(false)}
          onDeleteFiles={() => runDelete(true)}
        />
      )}
    </div>
  );
}

export default Catalog;
