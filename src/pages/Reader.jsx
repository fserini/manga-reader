import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { extractPageGroups, makeThumbnail } from '../comicFile.js';
import {
  getChapter,
  setChapterThumbnail,
  getReadingProgress,
  updateReadingProgress,
  setManualBookmark,
} from '../db.js';
import { useAppChrome } from '../AppChromeContext.jsx';
import './Reader.css';

const DOUBLE_TAP_DELAY_MS = 300;
const TAP_ZONE_RATIO = 0.3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const READING_MODES = [
  { value: 'single', key: 'reader.mode.single' },
  { value: 'spread', key: 'reader.mode.spread' },
  { value: 'scroll', key: 'reader.mode.scroll' },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getTouchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// Una pagina, o un segnaposto se url è null (immagine danneggiata,
// rilevata durante l'estrazione): non fa fallire la lettura del resto
// del capitolo, si salta solo quella pagina.
function Page({ url, alt, style }) {
  const { t } = useTranslation();

  if (!url) {
    return (
      <div className="reader-page-broken">
        <span aria-hidden="true">⚠️</span>
        <span>{t('reader.pageBroken', { alt })}</span>
      </div>
    );
  }
  return <img src={url} alt={alt} style={style} />;
}

// Le 5 icone del pannello controlli — vedi ADR-001. Un gruppo di icone invece
// di tab testuali: un controllo futuro è un'icona in più da aggiungere qui,
// non un gruppo da ridisegnare.
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function IconSingle() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="7" y="3" width="10" height="18" rx="1.4" />
    </svg>
  );
}

function IconSpread() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2.5" y="4" width="8.2" height="16" rx="1.2" />
      <rect x="13.3" y="4" width="8.2" height="16" rx="1.2" />
    </svg>
  );
}

function IconScroll() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="2.5" width="12" height="19" rx="1.4" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="8.5" />
      <line x1="8.5" y1="15.5" x2="15.5" y2="15.5" />
    </svg>
  );
}

function IconDirection() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="6" y1="8" x2="19" y2="8" />
      <polyline points="9.5 4.5 6 8 9.5 11.5" />
      <line x1="5" y1="16" x2="18" y2="16" />
      <polyline points="14.5 12.5 18 16 14.5 19.5" />
    </svg>
  );
}

function IconBookmark({ filled }) {
  return (
    <svg {...ICON_PROPS} fill={filled ? 'currentColor' : 'none'}>
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-6-4.2L6 20V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

const MODE_ICONS = {
  single: IconSingle,
  spread: IconSpread,
  scroll: IconScroll,
};

function Reader() {
  const { t } = useTranslation();
  const { chapterId } = useParams();
  const { setChromeHidden } = useAppChrome();

  const [pageGroups, setPageGroups] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readingDirection, setReadingDirection] = useState('rtl');
  const [interfaceVisible, setInterfaceVisible] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  // Pagina del segnalibro manuale (indice nell'elenco pages), o null.
  const [manualBookmarkPage, setManualBookmarkPage] = useState(null);

  const tapTimeoutRef = useRef(null);
  const pinchStateRef = useRef(null);
  // URL oggetto attualmente in uso: li teniamo in un ref (non in stato) per
  // poterli revocare senza dipendere dal valore corrente di pageGroups.
  const objectUrlsRef = useRef([]);
  // Contenitore scorrevole (modalità scroll) e flag per ripristinare la
  // posizione una volta sola dopo l'apertura di un capitolo.
  const scrollContainerRef = useRef(null);
  const pendingScrollRestoreRef = useRef(false);

  const pages = pageGroups.flatMap((group) => (readingDirection === 'rtl' ? [...group].reverse() : group));

  // Il tocco che nasconde i controlli del Lettore nasconde anche la barra di
  // navigazione dell'app (Libreria/Lettore/Impostazioni), non solo il
  // pannello interno — vedi AppChromeContext.jsx. Il cleanup la ripristina
  // sia ad ogni cambio di interfaceVisible sia, soprattutto, quando si esce
  // dal Lettore: altrimenti la barra resterebbe nascosta anche altrove.
  useEffect(() => {
    setChromeHidden(!interfaceVisible);
    return () => setChromeHidden(false);
  }, [interfaceVisible, setChromeHidden]);

  const revokeCurrentUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  // Estrae e mostra le pagine di un file. Se chapterIdForThumb è indicato,
  // genera anche la miniatura e la salva (copertina del catalogo).
  const openFile = useCallback(
    async (file, chapterIdForThumb = null) => {
      revokeCurrentUrls();
      setPageGroups([]);
      setCurrentIndex(0);
      setManualBookmarkPage(null);
      setError(null);
      setInterfaceVisible(true);

      try {
        const groups = await extractPageGroups(file);
        if (groups.length === 0) {
          setError(t('reader.noImagesFound'));
          return;
        }

        const urlGroups = groups.map((group) =>
          group.map((blob) => {
            if (!blob) return null; // pagina illeggibile: nessun URL da creare/revocare
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            return url;
          }),
        );
        const flatLength = urlGroups.reduce((count, group) => count + group.length, 0);

        // Per i capitoli aperti dalla Libreria: ripristina l'ultima pagina letta
        // e il segnalibro manuale. Fatto PRIMA di setPageGroups così il primo
        // render con le pagine ha già l'indice giusto (evita di salvare 0).
        let restoreIndex = 0;
        if (chapterIdForThumb != null) {
          const progress = await getReadingProgress(chapterIdForThumb);
          if (progress?.lastPageRead > 0) {
            restoreIndex = Math.min(progress.lastPageRead, flatLength - 1);
          }
          setManualBookmarkPage(progress?.manualBookmarkPage ?? null);
          pendingScrollRestoreRef.current = restoreIndex > 0;
        }

        setPageGroups(urlGroups);
        setCurrentIndex(restoreIndex);

        if (chapterIdForThumb != null && groups[0]?.[0]) {
          makeThumbnail(groups[0][0])
            .then((thumbnail) => thumbnail && setChapterThumbnail(chapterIdForThumb, thumbnail))
            .catch(() => {});
        }
      } catch {
        const isCbr = /\.cbr$/i.test(file.name);
        setError(t('reader.invalidFile', { format: isCbr ? 'CBR' : 'CBZ' }));
      }
    },
    [revokeCurrentUrls, t],
  );

  // Apertura di un capitolo dalla Libreria (rotta /reader/:chapterId). Il
  // permesso di lettura sull'handle è già stato concesso durante il tocco nella
  // Libreria (serve un gesto utente); qui ci limitiamo a verificarlo e leggere.
  useEffect(() => {
    if (!chapterId) return;
    let cancelled = false;

    (async () => {
      try {
        const chapter = await getChapter(Number(chapterId));
        if (cancelled) return;
        if (!chapter || !chapter.handle) {
          setError(t('reader.chapterNotFound'));
          return;
        }

        const granted = (await chapter.handle.queryPermission({ mode: 'read' })) === 'granted';
        if (cancelled) return;
        if (!granted) {
          setError(t('reader.permissionNotGranted'));
          return;
        }

        const file = await chapter.handle.getFile();
        if (cancelled) return;
        await openFile(file, chapter.id);
      } catch {
        if (!cancelled) {
          setError(t('reader.chapterOpenError'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapterId, openFile, t]);

  // Alla chiusura del Lettore, libera gli URL oggetto rimasti.
  useEffect(() => revokeCurrentUrls, [revokeCurrentUrls]);

  const totalPages = pages.length;

  // Salvataggio automatico del progresso: ogni volta che cambia la pagina
  // corrente (di un capitolo aperto dalla Libreria), registriamo l'ultima
  // pagina letta. È una sincronizzazione con un sistema esterno (IndexedDB),
  // quindi vive in un effetto — senza setState, nessun ciclo di render.
  useEffect(() => {
    if (!chapterId || totalPages === 0) return;
    updateReadingProgress(Number(chapterId), { lastPageRead: currentIndex, totalPages });
  }, [chapterId, currentIndex, totalPages]);

  // Ripristino della posizione in modalità scroll: una volta sola dopo
  // l'apertura, porta in vista la pagina da cui si riprende.
  useEffect(() => {
    if (!pendingScrollRestoreRef.current || mode !== 'scroll' || totalPages === 0) return;
    const container = scrollContainerRef.current;
    const target = container?.children[currentIndex];
    if (target) {
      target.scrollIntoView({ block: 'start' });
      pendingScrollRestoreRef.current = false;
    }
  }, [mode, totalPages, currentIndex]);

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    await openFile(file);
  }

  const step = mode === 'spread' ? 2 : 1;

  function clampIndex(index) {
    return clamp(index, 0, pages.length - 1);
  }

  function goToPrevious() {
    setCurrentIndex((index) => clampIndex(index - step));
    setZoomScale(1);
  }

  function goToNext() {
    setCurrentIndex((index) => clampIndex(index + step));
    setZoomScale(1);
  }

  function toggleReadingDirection() {
    setReadingDirection((direction) => (direction === 'rtl' ? 'ltr' : 'rtl'));
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setZoomScale(1);
  }

  function toggleManualBookmark() {
    if (!chapterId) return;
    // Tocca sulla pagina già segnalibrata → rimuove il segnalibro.
    const nextPage = manualBookmarkPage === currentIndex ? null : currentIndex;
    setManualBookmarkPage(nextPage);
    setManualBookmark(Number(chapterId), nextPage);
  }

  function goToBookmark() {
    if (manualBookmarkPage == null) return;
    setCurrentIndex(clampIndex(manualBookmarkPage));
    setZoomScale(1);
    if (mode === 'scroll') {
      const target = scrollContainerRef.current?.children[manualBookmarkPage];
      target?.scrollIntoView({ block: 'start' });
    }
  }

  // In modalità scroll la pagina "corrente" è quella più in alto ancora visibile:
  // la ricaviamo dalla posizione di scorrimento (con rAF per non fare troppi
  // aggiornamenti), così il progresso si salva anche scorrendo.
  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    window.requestAnimationFrame(() => {
      const children = container.children;
      const top = container.scrollTop;
      let index = 0;
      for (let i = 0; i < children.length; i += 1) {
        if (children[i].offsetTop - container.offsetTop <= top + 8) index = i;
        else break;
      }
      setCurrentIndex((current) => (current === index ? current : index));
    });
  }

  function handleSingleTap(zone) {
    if (zone === 'center') {
      setInterfaceVisible((visible) => !visible);
      return;
    }

    if (mode === 'scroll') return;

    const isNextZone = readingDirection === 'rtl' ? zone === 'left' : zone === 'right';
    if (isNextZone) {
      goToNext();
    } else {
      goToPrevious();
    }
  }

  function handleDoubleTap() {
    handleModeChange(mode === 'single' ? 'spread' : 'single');
  }

  function handlePagesClick(event) {
    if (zoomScale !== 1) return; // con l'immagine ingrandita si preferisce lo scroll per spostarsi, non il tap

    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      handleDoubleTap();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const zone = relativeX < TAP_ZONE_RATIO ? 'left' : relativeX > 1 - TAP_ZONE_RATIO ? 'right' : 'center';

    tapTimeoutRef.current = setTimeout(() => {
      tapTimeoutRef.current = null;
      handleSingleTap(zone);
    }, DOUBLE_TAP_DELAY_MS);
  }

  function handleTouchStart(event) {
    if (event.touches.length === 2) {
      pinchStateRef.current = {
        initialDistance: getTouchDistance(event.touches),
        initialScale: zoomScale,
      };
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length === 2 && pinchStateRef.current) {
      event.preventDefault();
      const distance = getTouchDistance(event.touches);
      const ratio = distance / pinchStateRef.current.initialDistance;
      setZoomScale(clamp(pinchStateRef.current.initialScale * ratio, MIN_ZOOM, MAX_ZOOM));
    }
  }

  function handleTouchEnd(event) {
    if (event.touches.length < 2) {
      pinchStateRef.current = null;
    }
  }

  const secondPageOfSpread = pages[currentIndex + 1];
  const pagesInteractionProps = {
    onClick: handlePagesClick,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
  const zoomStyle = zoomScale !== 1 ? { transform: `scale(${zoomScale})` } : undefined;
  const progressPercent = pages.length > 0 ? Math.round(((currentIndex + 1) / pages.length) * 100) : 0;
  const pageCounterLabel = `${currentIndex + 1}${
    mode === 'spread' && secondPageOfSpread !== undefined ? `-${currentIndex + 2}` : ''
  } / ${pages.length}`;

  return (
    <div className="reader">
      {/* Il file input resta un caso a sé: esiste solo prima che qualunque
          pagina sia caricata (apertura diretta del Lettore, non da un
          capitolo di libreria), quindi non condivide lo spazio con i
          controlli di lettura veri e propri. */}
      {!chapterId && pages.length === 0 && (
        <label className="reader-file-input">
          <input type="file" accept=".cbz,.cbr" onChange={handleFileChange} />
          {t('reader.chooseFile')}
        </label>
      )}

      {error && (
        <p className="reader-error" role="alert">
          {error}
        </p>
      )}

      {pages.length === 0 && !error && (
        <div className="reader-empty">
          <p>{chapterId ? t('reader.loadingChapter') : t('reader.chooseFileToStart')}</p>
        </div>
      )}

      {pages.length > 0 && mode === 'scroll' && (
        <div
          className="reader-pages reader-pages--scroll"
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onClick={handlePagesClick}
        >
          {pages.map((pageUrl, index) => (
            <Page key={pageUrl ?? `broken-${index}`} url={pageUrl} alt={t('reader.pageAlt', { number: index + 1 })} />
          ))}
        </div>
      )}

      {pages.length > 0 && mode === 'single' && (
        <div className="reader-pages reader-pages--single" {...pagesInteractionProps}>
          <Page url={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
        </div>
      )}

      {pages.length > 0 && mode === 'spread' && (
        <div className="reader-pages reader-pages--spread" {...pagesInteractionProps}>
          {readingDirection === 'rtl' ? (
            <>
              {secondPageOfSpread !== undefined && (
                <Page url={secondPageOfSpread} alt={t('reader.pageAlt', { number: currentIndex + 2 })} style={zoomStyle} />
              )}
              <Page url={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
            </>
          ) : (
            <>
              <Page url={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
              {secondPageOfSpread !== undefined && (
                <Page url={secondPageOfSpread} alt={t('reader.pageAlt', { number: currentIndex + 2 })} style={zoomStyle} />
              )}
            </>
          )}
        </div>
      )}

      {/* Filo di avanzamento: sempre visibile quando ci sono pagine, a
          differenza del vecchio contatore testuale che spariva insieme al
          resto dell'interfaccia — qui l'obiettivo è sapere sempre "a che
          punto sono" senza dover richiamare i controlli. */}
      {pages.length > 0 && (
        <div className="reader-progress">
          {chapterId && manualBookmarkPage != null && manualBookmarkPage !== currentIndex && (
            <button
              type="button"
              className="reader-progress-bookmark"
              onClick={goToBookmark}
              aria-label={t('reader.gotoBookmark', { page: manualBookmarkPage + 1 })}
            >
              <IconBookmark filled />
              <span>{manualBookmarkPage + 1}</span>
            </button>
          )}
          <span className="reader-progress-count">{pageCounterLabel}</span>
          <div className="reader-progress-bar" aria-hidden="true">
            <div className="reader-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {interfaceVisible && pages.length > 0 && (
        <div className="reader-controls">
          <div className="reader-controls-group" role="group" aria-label={t('reader.modeGroupAria')}>
            {READING_MODES.map(({ value, key }) => {
              const Icon = MODE_ICONS[value];
              return (
                <button
                  key={value}
                  type="button"
                  className={mode === value ? 'active' : ''}
                  aria-pressed={mode === value}
                  aria-label={t(key)}
                  onClick={() => handleModeChange(value)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>

          <div className="reader-controls-divider" />

          <div className="reader-controls-group reader-controls-group--actions">
            <button
              type="button"
              onClick={toggleReadingDirection}
              aria-label={readingDirection === 'rtl' ? t('reader.directionRtl') : t('reader.directionLtr')}
              title={readingDirection === 'rtl' ? t('reader.directionRtl') : t('reader.directionLtr')}
            >
              <IconDirection />
            </button>
            {chapterId && (
              <button
                type="button"
                className={manualBookmarkPage === currentIndex ? 'active' : ''}
                aria-pressed={manualBookmarkPage === currentIndex}
                aria-label={manualBookmarkPage === currentIndex ? t('reader.bookmarkSet') : t('reader.bookmarkAdd')}
                title={t('reader.bookmarkTitle')}
                onClick={toggleManualBookmark}
              >
                <IconBookmark filled={manualBookmarkPage === currentIndex} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Reader;
