import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getAllSeries,
  getVolumesForSeries,
  getChaptersForVolume,
  getChaptersUnderSeries,
  getChaptersUnderVolume,
  getReadingProgressMap,
  getAllCategorizedChapters,
  setVolumeMarkedRead,
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
import { useObjectUrl } from '../useObjectUrl.js';
import Icon from './Icon.jsx';
import DeleteDialog from './DeleteDialog.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import CoverPicker from './CoverPicker.jsx';
import TagsDialog from './TagsDialog.jsx';
import RenameDialog from './RenameDialog.jsx';
import { SkeletonList } from './Skeleton.jsx';
import './Catalog.css';

const canDeleteFiles = isFileDeletionSupported();
// Tetto ai capitoli mostrati come risultato della ricerca globale: oltre,
// l'elenco diventerebbe di nuovo il muro di righe evitato in Fase 22.
const MAX_CHAPTER_RESULTS = 50;

function isCompleted(progress) {
  return Boolean(progress && progress.totalPages > 0 && progress.lastPageRead >= progress.totalPages - 1);
}

// Un capitolo è "letto" se completato davvero oppure segnato a mano (Fase 25).
function isChapterDone(chapter, progress) {
  return Boolean(chapter.markedRead) || isCompleted(progress);
}

function completionPercent(progress) {
  if (!progress || !progress.totalPages) return 0;
  return Math.round(((progress.lastPageRead + 1) / progress.totalPages) * 100);
}

// Tutti i tag in uso nelle serie, senza duplicati (maiuscole ignorate: vale la
// prima grafia incontrata), in ordine alfabetico.
function collectTags(seriesList) {
  const byKey = new Map();
  seriesList.forEach((item) => {
    (item.tags ?? []).forEach((tag) => {
      if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
    });
  });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

function hasTag(item, tag) {
  return (item.tags ?? []).some((existing) => existing.toLowerCase() === tag.toLowerCase());
}

// Piccola copertina in testa a una riga di Serie/Volume: compare solo se
// l'utente ne ha scelta una apposta (coverCustom) — vedi Fase 25.
function RowThumb({ blob }) {
  const url = useObjectUrl(blob);
  if (!url) return null;
  return <img className="catalog-index-thumb" src={url} alt="" />;
}

// Mostra una miniatura da un Blob (creando/revocando l'URL oggetto). Se la
// copertina non è ancora disponibile, il segnaposto non è una semplice icona:
// è un "dorso" con il titolo in verticale, sullo stesso principio delle
// copertine vere — vedi ADR-001. Usato solo a livello Capitolo (Fase 22):
// Serie e Volumi sono livelli di sola aggregazione, senza un'immagine
// propria — mostrarci sopra la stessa copertina (reale o segnaposto) li
// rendeva indistinguibili dal Capitolo, tutti con lo stesso "punto" cliccabile.
function Cover({ blob, alt, title }) {
  const url = useObjectUrl(blob);

  if (!url) {
    return (
      <div className="catalog-cover catalog-cover--placeholder" aria-hidden="true">
        <span className="catalog-cover-spine">{title}</span>
      </div>
    );
  }
  return <img className="catalog-cover" src={url} alt={alt} />;
}

// onFavoriteChanged: chiamata dopo ogni cambio di preferito (o di copertina),
// così la Libreria può aggiornare la sezione dedicata (che vive in un
// componente sorella, separato per non perdere il livello di navigazione
// corrente qui dentro). onProgressChanged, allo stesso modo, dopo un "segna
// come letto" (o "non letto"), che può cambiare cosa c'è da continuare.
function Catalog({ onFavoriteChanged, onProgressChanged }) {
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
  // ordinamento delle serie ("ultimi letti" usa series.lastReadAt, mantenuta
  // dal database: vedi touchSeriesLastRead in db.js).
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title'); // 'title' | 'recent'

  const [notice, setNotice] = useState(null);
  // Elemento in attesa di conferma rimozione: { kind, item, label, note } o null.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Fase 25. Filtro per tag (uno alla volta) sull'elenco delle serie; elenco
  // dei capitoli per la ricerca globale (null = da (ri)caricare, caricato solo
  // quando serve davvero); dialog di copertina/tag/"non letto" aperti.
  const [activeTag, setActiveTag] = useState(null);
  const [searchableChapters, setSearchableChapters] = useState(null);
  const [coverTarget, setCoverTarget] = useState(null); // { kind, item, label }
  const [tagsTarget, setTagsTarget] = useState(null); // una serie
  const [unreadTarget, setUnreadTarget] = useState(null); // un volume
  // Fase 27: serie o volume da rinominare, { kind, item, label }.
  const [renameTarget, setRenameTarget] = useState(null);
  // Verso dell'ultimo cambio di livello, per la transizione laterale (Fase 26):
  // 'forward' scendendo (Serie → Volumi → Capitoli), 'back' risalendo; null
  // finché non si naviga, così la prima apertura non si anima.
  const [direction, setDirection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getAllSeries();
      if (!cancelled) {
        setSeries(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // La ricerca globale (livello Serie, query non vuota) ha bisogno di tutti i
  // capitoli: li carichiamo la prima volta che si scrive qualcosa, non
  // all'apertura del Catalogo, e li teniamo finché la libreria non cambia.
  const searchActive = level === 'series' && searchQuery.trim() !== '';
  useEffect(() => {
    if (!searchActive || searchableChapters !== null) return undefined;
    let cancelled = false;
    (async () => {
      const list = await getAllCategorizedChapters();
      if (!cancelled) setSearchableChapters(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchActive, searchableChapters]);

  // Calcola, per ogni volume di una serie, quanti capitoli risultano letti.
  async function loadVolumeStats(volumeList) {
    const stats = {};
    await Promise.all(
      volumeList.map(async (volume) => {
        const volumeChapters = await getChaptersForVolume(volume.id);
        const map = await getReadingProgressMap(volumeChapters.map((chapter) => chapter.id));
        const read = volumeChapters.filter((chapter) => isChapterDone(chapter, map[chapter.id])).length;
        stats[volume.id] = { read, total: volumeChapters.length };
      }),
    );
    return stats;
  }

  // Ricarica l'elenco del livello attualmente mostrato, dopo una rimozione (o
  // qualunque modifica). Invalida anche l'elenco dei capitoli della ricerca
  // globale: si ricarica da solo alla prossima ricerca.
  async function reloadCurrentLevel() {
    setSearchableChapters(null);
    if (level === 'series') {
      setSeries(await getAllSeries());
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
    setDirection('forward');
    setLevel('volumes');
    setSearchQuery('');
  }

  async function openVolume(volume) {
    setCurrentVolume(volume);
    const chapterList = await getChaptersForVolume(volume.id);
    setChapters(chapterList);
    setProgressMap(await getReadingProgressMap(chapterList.map((chapter) => chapter.id)));
    setDirection('forward');
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
    setDirection('back');
    setLevel('series');
    setCurrentSeries(null);
    setCurrentVolume(null);
    setSearchQuery('');
  }

  function goToVolumes() {
    setDirection('back');
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

  // "Segna come letto" su un volume intero. Se è già tutto letto il gesto
  // diventa "segna come non letto", che azzera anche il progresso reale dei
  // suoi capitoli: per questo chiede conferma (vedi setVolumeMarkedRead).
  async function toggleVolumeRead(volume) {
    const stats = volumeStats[volume.id];
    if (stats && stats.total > 0 && stats.read === stats.total) {
      setUnreadTarget(volume);
      return;
    }
    await setVolumeMarkedRead(volume.id, true);
    await reloadCurrentLevel();
    onProgressChanged?.();
  }

  async function confirmUnread() {
    const volume = unreadTarget;
    setUnreadTarget(null);
    await setVolumeMarkedRead(volume.id, false);
    await reloadCurrentLevel();
    onProgressChanged?.();
  }

  // Dopo aver scelto una copertina: chiude il dialog, ricarica l'elenco e
  // avvisa la Libreria (i Preferiti mostrano le stesse copertine).
  async function handleCoverSaved() {
    setCoverTarget(null);
    await reloadCurrentLevel();
    onFavoriteChanged?.();
  }

  async function handleTagsSaved() {
    setTagsTarget(null);
    await reloadCurrentLevel();
  }

  // Dopo una rinomina: ricarica il livello (anche la ricerca globale, che porta
  // titoli e numeri di volume) e fa aggiornare i Preferiti, che mostrano il
  // titolo della serie accanto ai loro volumi e capitoli.
  async function handleRenamed() {
    setRenameTarget(null);
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
    return <SkeletonList rows={5} label={t('catalog.loading')} />;
  }

  if (series.length === 0) {
    return <p className="catalog-empty">{t('catalog.empty')}</p>;
  }

  // Filtro testuale e ordinamento: pura trasformazione degli elenchi già
  // caricati, ricalcolata ad ogni render — nessuno stato/effetto dedicato,
  // sono pochi elementi e il calcolo è economico.
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Tag in uso e filtro attivo (se il tag scelto non esiste più, es. dopo
  // averlo tolto dall'ultima serie che lo aveva, il filtro decade da solo).
  const allTags = collectTags(series);
  const effectiveTag = activeTag && allTags.some((tag) => tag.toLowerCase() === activeTag.toLowerCase()) ? activeTag : null;

  // A livello Serie la ricerca è globale (Fase 25): cerca nel titolo e nei
  // tag delle serie, e tra i capitoli di tutta la libreria (serie, volume,
  // numero, nome del file).
  const visibleSeries = series
    .filter((item) => !effectiveTag || hasTag(item, effectiveTag))
    .filter(
      (item) =>
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        (item.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedQuery)),
    )
    .sort((a, b) =>
      sortBy === 'recent'
        ? (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)
        : a.title.localeCompare(b.title, undefined, { numeric: true }),
    );

  const chapterMatches =
    searchActive && searchableChapters
      ? searchableChapters
          .filter((chapter) =>
            [
              chapter.seriesTitle,
              chapter.volumeNumber != null ? t('catalog.volumeLabel', { number: chapter.volumeNumber }) : '',
              t('catalog.chapterLabel', { number: chapter.number }),
              chapter.fileName,
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery),
          )
          .sort(
            (a, b) =>
              a.seriesTitle.localeCompare(b.seriesTitle, undefined, { numeric: true }) ||
              (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0) ||
              a.number - b.number,
          )
      : [];

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
          placeholder={
            level === 'series'
              ? t('catalog.searchPlaceholderGlobal')
              : t('catalog.searchPlaceholder', { level: currentLevelLabel })
          }
          aria-label={
            level === 'series' ? t('catalog.searchAriaGlobal') : t('catalog.searchAria', { level: currentLevelLabel })
          }
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

      {/* Tutto ciò che cambia con il livello sta in un contenitore con la key del
          livello: a ogni cambio si rimonta, e la sua animazione d'ingresso (slide
          laterale, vedi Catalog.css) fa da transizione. I dialog restano fuori: un
          elemento con transform diventerebbe il riferimento dei loro `fixed`. */}
      <div key={level} className={`catalog-level${direction ? ` catalog-level--${direction}` : ''}`}>
      {level === 'series' && allTags.length > 0 && (
        <ul className="catalog-tag-filter" aria-label={t('catalog.tagFilterAria')}>
          {allTags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className={effectiveTag === tag ? 'active' : ''}
                aria-pressed={effectiveTag === tag}
                onClick={() => setActiveTag(effectiveTag === tag ? null : tag)}
              >
                {tag}
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p className="catalog-error" role="alert">
          {notice}
        </p>
      )}

      {normalizedQuery &&
        ((level === 'series' &&
          visibleSeries.length === 0 &&
          searchableChapters !== null &&
          chapterMatches.length === 0) ||
          (level === 'volumes' && visibleVolumes.length === 0) ||
          (level === 'chapters' && visibleChapters.length === 0)) && (
          <p className="catalog-empty">{t('catalog.noResults', { query: searchQuery.trim() })}</p>
        )}

      {level === 'series' && searchActive && visibleSeries.length > 0 && (
        <h3 className="catalog-results-heading">{t('catalog.resultsSeries')}</h3>
      )}

      {level === 'series' && (
        <ul className="catalog-index">
          {visibleSeries.map((item) => (
            <li key={item.id} className="catalog-index-row">
              <button type="button" className="catalog-index-main" onClick={() => openSeries(item)}>
                {item.coverCustom && <RowThumb blob={item.coverThumbnail} />}
                <span className="catalog-index-text">
                  <span className="catalog-index-title">{item.title}</span>
                  {(item.tags ?? []).length > 0 && (
                    <span className="catalog-index-tags">
                      {item.tags.map((tag) => (
                        <span key={tag} className="catalog-tag">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
              <div className="catalog-index-actions">
                <button
                  type="button"
                  className="catalog-index-rename"
                  aria-label={t('catalog.renameSeries', { title: item.title })}
                  onClick={() => setRenameTarget({ kind: 'series', item, label: item.title })}
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="catalog-index-cover"
                  aria-label={t('catalog.coverSeries', { title: item.title })}
                  onClick={() => setCoverTarget({ kind: 'series', item, label: item.title })}
                >
                  <Icon name="image" />
                </button>
                <button
                  type="button"
                  className="catalog-index-tagsbtn"
                  aria-label={t('catalog.tagsSeries', { title: item.title })}
                  onClick={() => setTagsTarget(item)}
                >
                  <Icon name="tag" />
                </button>
                <button
                  type="button"
                  className="catalog-index-favorite"
                  aria-label={
                    item.favorite
                      ? t('catalog.removeFavorite', { title: item.title })
                      : t('catalog.addFavorite', { title: item.title })
                  }
                  aria-pressed={Boolean(item.favorite)}
                  onClick={() => toggleFavorite('series', item.id)}
                >
                  <Icon name="star" filled={Boolean(item.favorite)} />
                </button>
                <button
                  type="button"
                  className="catalog-index-delete"
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
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {level === 'series' && searchActive && chapterMatches.length > 0 && (
        <>
          <h3 className="catalog-results-heading">{t('catalog.resultsChapters')}</h3>
          <ul className="catalog-index">
            {chapterMatches.slice(0, MAX_CHAPTER_RESULTS).map((chapter) => (
              <li key={chapter.id} className="catalog-index-row">
                <button type="button" className="catalog-index-main" onClick={() => openChapter(chapter)}>
                  <span className="catalog-index-text">
                    <span className="catalog-index-title">
                      {t('catalog.chapterLabel', { number: chapter.number })}
                    </span>
                    <span className="catalog-index-sub">
                      {[
                        chapter.seriesTitle,
                        chapter.volumeNumber != null
                          ? t('catalog.volumeLabel', { number: chapter.volumeNumber })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {chapterMatches.length > MAX_CHAPTER_RESULTS && (
            <p className="catalog-empty">{t('catalog.resultsCapped', { count: MAX_CHAPTER_RESULTS })}</p>
          )}
        </>
      )}

      {level === 'volumes' && (
        <ul className="catalog-index">
          {visibleVolumes.map((volume) => (
            <li key={volume.id} className="catalog-index-row">
              <button type="button" className="catalog-index-main" onClick={() => openVolume(volume)}>
                {volume.coverCustom && <RowThumb blob={volume.coverThumbnail} />}
                <span className="catalog-index-text">
                  <span className="catalog-index-title">{t('catalog.volumeLabel', { number: volume.number })}</span>
                </span>
                {volumeStats[volume.id] && volumeStats[volume.id].total > 0 && (
                  <span className="catalog-index-sub">
                    {t('catalog.readCount', {
                      read: volumeStats[volume.id].read,
                      total: volumeStats[volume.id].total,
                    })}
                  </span>
                )}
              </button>
              <div className="catalog-index-actions">
                <button
                  type="button"
                  className="catalog-index-rename"
                  aria-label={t('catalog.renameVolume', { number: volume.number })}
                  onClick={() =>
                    setRenameTarget({
                      kind: 'volume',
                      item: volume,
                      label: t('catalog.volumeLabel', { number: volume.number }),
                    })
                  }
                >
                  <Icon name="edit" />
                </button>
                <button
                  type="button"
                  className="catalog-index-cover"
                  aria-label={t('catalog.coverVolume', { number: volume.number })}
                  onClick={() =>
                    setCoverTarget({
                      kind: 'volume',
                      item: volume,
                      label: t('catalog.volumeLabel', { number: volume.number }),
                    })
                  }
                >
                  <Icon name="image" />
                </button>
                {volumeStats[volume.id] && volumeStats[volume.id].total > 0 && (
                  <button
                    type="button"
                    className="catalog-index-read"
                    aria-pressed={volumeStats[volume.id].read === volumeStats[volume.id].total}
                    aria-label={
                      volumeStats[volume.id].read === volumeStats[volume.id].total
                        ? t('catalog.markUnread', { number: volume.number })
                        : t('catalog.markRead', { number: volume.number })
                    }
                    onClick={() => toggleVolumeRead(volume)}
                  >
                    <Icon name="check" />
                  </button>
                )}
                <button
                  type="button"
                  className="catalog-index-favorite"
                  aria-label={
                    volume.favorite
                      ? t('catalog.removeFavoriteVolume', { number: volume.number })
                      : t('catalog.addFavoriteVolume', { number: volume.number })
                  }
                  aria-pressed={Boolean(volume.favorite)}
                  onClick={() => toggleFavorite('volume', volume.id)}
                >
                  <Icon name="star" filled={Boolean(volume.favorite)} />
                </button>
                <button
                  type="button"
                  className="catalog-index-delete"
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
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {level === 'chapters' && (
        <ul className="catalog-grid">
          {visibleChapters.map((chapter) => (
            <li key={chapter.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openChapter(chapter)}>
                <Cover
                  blob={chapter.thumbnail}
                  alt=""
                  title={t('catalog.chapterLabel', { number: chapter.number })}
                />
                <span className="catalog-card-title">{t('catalog.chapterLabel', { number: chapter.number })}</span>
                {isChapterDone(chapter, progressMap[chapter.id]) ? (
                  <span className="catalog-card-sub catalog-card-sub--done">
                    <Icon name="check" size={13} />
                    {t('catalog.done')}
                  </span>
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
                <Icon name="star" filled={Boolean(chapter.favorite)} />
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={t('catalog.deleteChapter', { number: chapter.number })}
                onClick={() => askDelete('chapter', chapter, t('catalog.deleteChapterLabel', { number: chapter.number }), null)}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}

      </div>

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

      {coverTarget && (
        <CoverPicker
          kind={coverTarget.kind}
          item={coverTarget.item}
          label={coverTarget.label}
          onClose={() => setCoverTarget(null)}
          onSaved={handleCoverSaved}
        />
      )}

      {renameTarget && (
        <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} onSaved={handleRenamed} />
      )}

      {tagsTarget && (
        <TagsDialog
          series={tagsTarget}
          allTags={allTags}
          onClose={() => setTagsTarget(null)}
          onSaved={handleTagsSaved}
        />
      )}

      {unreadTarget && (
        <ConfirmDialog
          title={t('catalog.unreadTitle', { number: unreadTarget.number })}
          note={t('catalog.unreadNote')}
          confirmLabel={t('catalog.unreadConfirm')}
          cancelLabel={t('catalog.cancel')}
          onConfirm={confirmUnread}
          onCancel={() => setUnreadTarget(null)}
        />
      )}
    </div>
  );
}

export default Catalog;
