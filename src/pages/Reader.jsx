import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { extractPageGroups, makeThumbnail } from '../comicFile.js';
import {
  getChapter,
  setChapterThumbnail,
  getReadingProgress,
  updateReadingProgress,
  setManualBookmark,
} from '../db.js';
import './Reader.css';

const DOUBLE_TAP_DELAY_MS = 300;
const TAP_ZONE_RATIO = 0.3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const READING_MODES = [
  { value: 'single', label: 'Pagina singola' },
  { value: 'spread', label: 'Doppia pagina' },
  { value: 'scroll', label: 'Scroll continuo' },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getTouchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function Reader() {
  const { chapterId } = useParams();

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
          setError('Nessuna immagine trovata in questo file.');
          return;
        }

        const urlGroups = groups.map((group) =>
          group.map((blob) => {
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
        setError(`Impossibile leggere il file: non sembra un ${isCbr ? 'CBR' : 'CBZ'} valido.`);
      }
    },
    [revokeCurrentUrls],
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
          setError('Capitolo non trovato in libreria.');
          return;
        }

        const granted = (await chapter.handle.queryPermission({ mode: 'read' })) === 'granted';
        if (cancelled) return;
        if (!granted) {
          setError('Permesso di accesso al file non concesso. Torna alla libreria e tocca di nuovo il capitolo.');
          return;
        }

        const file = await chapter.handle.getFile();
        if (cancelled) return;
        await openFile(file, chapter.id);
      } catch {
        if (!cancelled) {
          setError('Impossibile aprire il capitolo: il file potrebbe essere stato spostato o eliminato.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapterId, openFile]);

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
  const isFirstPage = currentIndex === 0;
  const isLastPage = currentIndex >= pages.length - 1;

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

  return (
    <div className="reader">
      {interfaceVisible && (
        <div className="reader-toolbar">
          {!chapterId && (
            <label className="reader-file-input">
              <input type="file" accept=".cbz,.cbr" onChange={handleFileChange} />
              Scegli file
            </label>
          )}

          {pages.length > 0 && (
            <div className="mode-selector" role="group" aria-label="Modalità di lettura">
              {READING_MODES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={mode === value ? 'active' : ''}
                  onClick={() => handleModeChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {pages.length > 0 && (
            <button type="button" className="direction-toggle" onClick={toggleReadingDirection}>
              {readingDirection === 'rtl' ? 'Lettura: giapponese (dx→sx)' : 'Lettura: occidentale (sx→dx)'}
            </button>
          )}

          {chapterId && pages.length > 0 && (
            <button
              type="button"
              className="bookmark-toggle"
              aria-pressed={manualBookmarkPage === currentIndex}
              onClick={toggleManualBookmark}
              title="Segnalibro su questa pagina"
            >
              {manualBookmarkPage === currentIndex ? '🔖 Segnalibro' : '🏷️ Segna pagina'}
            </button>
          )}

          {chapterId && manualBookmarkPage != null && manualBookmarkPage !== currentIndex && (
            <button type="button" className="bookmark-goto" onClick={goToBookmark}>
              Vai al segnalibro (pag. {manualBookmarkPage + 1})
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="reader-error" role="alert">
          {error}
        </p>
      )}

      {pages.length === 0 && !error && (
        <div className="reader-empty">
          <p>{chapterId ? 'Caricamento del capitolo…' : 'Scegli un file CBZ o CBR per iniziare a leggere.'}</p>
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
            <img key={pageUrl} src={pageUrl} alt={`Pagina ${index + 1}`} />
          ))}
        </div>
      )}

      {pages.length > 0 && mode === 'single' && (
        <div className="reader-pages reader-pages--single" {...pagesInteractionProps}>
          <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} style={zoomStyle} />
        </div>
      )}

      {pages.length > 0 && mode === 'spread' && (
        <div className="reader-pages reader-pages--spread" {...pagesInteractionProps}>
          {readingDirection === 'rtl' ? (
            <>
              {secondPageOfSpread && (
                <img src={secondPageOfSpread} alt={`Pagina ${currentIndex + 2}`} style={zoomStyle} />
              )}
              <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} style={zoomStyle} />
            </>
          ) : (
            <>
              <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} style={zoomStyle} />
              {secondPageOfSpread && (
                <img src={secondPageOfSpread} alt={`Pagina ${currentIndex + 2}`} style={zoomStyle} />
              )}
            </>
          )}
        </div>
      )}

      {interfaceVisible && pages.length > 0 && mode !== 'scroll' && (
        <div className="reader-nav">
          <button type="button" onClick={goToPrevious} disabled={isFirstPage}>
            ‹ Precedente
          </button>
          <span>
            {currentIndex + 1}
            {mode === 'spread' && secondPageOfSpread ? `-${currentIndex + 2}` : ''} / {pages.length}
          </span>
          <button type="button" onClick={goToNext} disabled={isLastPage}>
            Successiva ›
          </button>
        </div>
      )}
    </div>
  );
}

export default Reader;
