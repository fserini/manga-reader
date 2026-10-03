import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { extractPageGroups, makeThumbnail } from '../comicFile.js';
import { getFileExtension, SUPPORTED_EXTENSIONS_ATTR, SUPPORTED_FORMATS_LABEL } from '../fileAccess.js';
import {
  getChapter,
  setChapterThumbnail,
  getReadingProgress,
  updateReadingProgress,
  setManualBookmark,
  getNextChapterInVolume,
} from '../db.js';
import { useAppChrome } from '../AppChromeContext.jsx';
import Icon from '../components/Icon.jsx';
import './Reader.css';

const DOUBLE_TAP_DELAY_MS = 300;
const TAP_ZONE_RATIO = 0.3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const SWIPE_THRESHOLD_PX = 50;
const SWIPE_MAX_VERTICAL_PX = 60;
// Livelli ciclici del filtro notte (0 = spento): tre passi coprono le
// situazioni comuni senza la complessità di uno slider su un pannello già
// piccolo — vedi Fase 24.
const DIM_LEVELS = [0, 0.3, 0.6];

const READING_MODES = [
  { value: 'single', key: 'reader.mode.single' },
  { value: 'spread', key: 'reader.mode.spread' },
  { value: 'scroll', key: 'reader.mode.scroll' },
];

// Preferenze di lettura (modalità, direzione, filtro notte) ricordate tra un
// capitolo e l'altro — vedi Fase 24. Scritte solo dalle scelte esplicite
// dell'utente (mai dallo spread automatico in landscape), lette una sola
// volta all'avvio come stato iniziale dei relativi useState.
const READING_PREFS_KEY = 'manga-reader:reading-prefs';

function loadReadingPrefs() {
  try {
    const raw = localStorage.getItem(READING_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function updateReadingPrefs(partial) {
  try {
    const current = loadReadingPrefs() ?? {};
    localStorage.setItem(READING_PREFS_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {
    // Storage pieno o non disponibile (es. navigazione privata): la
    // preferenza semplicemente non persiste, non è un errore bloccante.
  }
}

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
        <Icon name="alert" size={32} />
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

function IconDim() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12a4.5 4.5 0 0 0 0-9 9 9 0 1 0 0 18 4.5 4.5 0 0 0 0-9z" fill="currentColor" stroke="none" />
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
  const navigate = useNavigate();
  const { setChromeHidden } = useAppChrome();

  const [pageGroups, setPageGroups] = useState([]);
  const [error, setError] = useState(null);
  // Modalità, direzione e filtro notte: valore iniziale dall'ultima
  // preferenza salvata (Fase 24), letta una sola volta all'avvio.
  const [mode, setMode] = useState(() => loadReadingPrefs()?.mode ?? 'single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readingDirection, setReadingDirection] = useState(() => loadReadingPrefs()?.direction ?? 'rtl');
  const [interfaceVisible, setInterfaceVisible] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  const [dimLevel, setDimLevel] = useState(() => loadReadingPrefs()?.dim ?? 0);
  // Pagina del segnalibro manuale (indice nell'elenco pages), o null.
  const [manualBookmarkPage, setManualBookmarkPage] = useState(null);
  // Capitolo successivo nello stesso volume, per l'invito a fine lettura — o null.
  const [nextChapter, setNextChapter] = useState(null);

  const tapTimeoutRef = useRef(null);
  const pinchStateRef = useRef(null);
  // Tocco singolo in corso (per riconoscere uno swipe orizzontale) — vedi
  // handleTouchStart/handleTouchEnd. Azzerato appena un secondo dito entra in
  // gioco (diventa un pinch) o al termine del gesto.
  const swipeStateRef = useRef(null);
  // Uno swipe appena gestito genera comunque un "click" sintetico subito dopo
  // il touchend: va ignorato, altrimenti si naviga due volte.
  const ignoreNextClickRef = useRef(false);
  // true dal momento in cui l'utente sceglie esplicitamente una modalità per
  // QUESTO capitolo: da lì in poi lo spread automatico in landscape non la
  // sovrascrive più. Azzerato ad ogni apertura di capitolo, in openFile.
  const explicitModeThisChapterRef = useRef(false);
  // Specchio di `mode` leggibile dentro il listener di orientamento, che non
  // deve ri-registrarsi ad ogni cambio di modalità (altrimenti l'effetto
  // dovrebbe avere `mode` tra le dipendenze, riattivandosi di continuo).
  const modeRef = useRef(mode);
  // URL oggetto attualmente in uso: li teniamo in un ref (non in stato) per
  // poterli revocare senza dipendere dal valore corrente di pageGroups.
  const objectUrlsRef = useRef([]);
  // Contenitore scorrevole (modalità scroll) e flag per ripristinare la
  // posizione una volta sola dopo l'apertura di un capitolo.
  const scrollContainerRef = useRef(null);
  const pendingScrollRestoreRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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

  // Riarma "nessuna scelta esplicita ancora" ad ogni nuovo capitolo. Un
  // effetto a sé, sincrono rispetto al cambio di chapterId — a differenza del
  // reset dentro openFile, che avviene dopo alcuni await (lettura permesso,
  // apertura file) e quindi arriverebbe troppo tardi per l'effetto di
  // orientamento qui sotto, che deve vedere subito il valore azzerato.
  useEffect(() => {
    explicitModeThisChapterRef.current = false;
  }, [chapterId]);

  // Spread automatico in landscape (Fase 24): solo finché l'utente non ha
  // scelto esplicitamente una modalità per QUESTO capitolo, e solo tra
  // singola/doppia — la modalità scroll non è coinvolta. Tornando in
  // portrait, si ripristina l'ultima preferenza salvata (non per forza
  // "singola").
  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');

    function applyOrientation(isLandscape) {
      if (explicitModeThisChapterRef.current || modeRef.current === 'scroll') return;
      setMode(isLandscape ? 'spread' : (loadReadingPrefs()?.mode ?? 'single'));
    }

    function handleChange(event) {
      applyOrientation(event.matches);
    }

    applyOrientation(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [chapterId]);

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
      setNextChapter(null);
      setError(null);
      setInterfaceVisible(true);
      explicitModeThisChapterRef.current = false;

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
      } catch (error) {
        // ArchiveError porta il motivo preciso; qualunque altro errore è
        // "non riesco a leggerlo" e basta.
        if (error.reason === 'encrypted') {
          setError(t('reader.encryptedFile'));
        } else if (error.reason === 'timeout') {
          setError(t('reader.archiveTimeout'));
        } else {
          const extension = getFileExtension(file.name);
          setError(t('reader.invalidFile', { format: extension ? extension.toUpperCase() : '?' }));
        }
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
        if (cancelled) return;
        setNextChapter(await getNextChapterInVolume(chapter.id));
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
    setReadingDirection((direction) => {
      const next = direction === 'rtl' ? 'ltr' : 'rtl';
      updateReadingPrefs({ direction: next });
      return next;
    });
  }

  // Unico punto da cui l'utente sceglie esplicitamente una modalità (pannello
  // controlli o doppio tap): segna la scelta per questo capitolo, così lo
  // spread automatico in landscape non la sovrascrive più, e la ricorda per
  // i prossimi capitoli.
  function handleModeChange(nextMode) {
    explicitModeThisChapterRef.current = true;
    setMode(nextMode);
    setZoomScale(1);
    updateReadingPrefs({ mode: nextMode });
  }

  // Filtro notte: ciclo tra i livelli invece di uno slider, per restare
  // semplice da toccare nel pannello controlli già compatto — vedi Fase 24.
  function cycleDim() {
    setDimLevel((level) => {
      const next = DIM_LEVELS[(DIM_LEVELS.indexOf(level) + 1) % DIM_LEVELS.length];
      updateReadingPrefs({ dim: next });
      return next;
    });
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
    // Uno swipe appena gestito in handleTouchEnd genera comunque questo
    // click sintetico subito dopo: va ignorato una volta sola, altrimenti si
    // naviga due volte per lo stesso gesto.
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
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
      swipeStateRef.current = null; // un secondo dito trasforma il gesto in pinch, non più in swipe
    } else if (event.touches.length === 1 && zoomScale === 1) {
      const touch = event.touches[0];
      swipeStateRef.current = { startX: touch.clientX, startY: touch.clientY };
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

  // Swipe orizzontale oltre al tap sui bordi (Fase 24): non sostituisce il
  // tap, lo affianca. Solo per singola/doppia pagina — in scroll il gesto
  // orizzontale non ha senso, si scorre verticalmente.
  function handleTouchEnd(event) {
    if (event.touches.length < 2) {
      pinchStateRef.current = null;
    }

    const swipe = swipeStateRef.current;
    swipeStateRef.current = null;
    if (!swipe || event.touches.length > 0 || mode === 'scroll') return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaY) > SWIPE_MAX_VERTICAL_PX) return;

    ignoreNextClickRef.current = true;
    const isNextSwipe = readingDirection === 'rtl' ? deltaX < 0 : deltaX > 0;
    if (isNextSwipe) {
      goToNext();
    } else {
      goToPrevious();
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
  // Ultima pagina (o ultimo spread) del capitolo: soglia per l'invito al
  // capitolo successivo — vedi Fase 24.
  const isAtChapterEnd = pages.length > 0 && currentIndex + step >= pages.length;
  const DIM_LABEL_KEYS = { 0: 'reader.dimOff', 0.3: 'reader.dimLow', 0.6: 'reader.dimHigh' };

  return (
    <div className="reader">
      {/* Il file input resta un caso a sé: esiste solo prima che qualunque
          pagina sia caricata (apertura diretta del Lettore, non da un
          capitolo di libreria), quindi non condivide lo spazio con i
          controlli di lettura veri e propri. */}
      {!chapterId && pages.length === 0 && (
        <label className="reader-file-input">
          <input type="file" accept={SUPPORTED_EXTENSIONS_ATTR} onChange={handleFileChange} />
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
          <p>{chapterId ? t('reader.loadingChapter') : t('reader.chooseFileToStart', { formats: SUPPORTED_FORMATS_LABEL })}</p>
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

      {/* Filtro notte: un velo scuro sopra le pagine, sotto filo di
          avanzamento e controlli — vedi Fase 24. */}
      {pages.length > 0 && dimLevel > 0 && (
        <div className="reader-dim-overlay" style={{ opacity: dimLevel }} aria-hidden="true" />
      )}

      {/* Invito al capitolo successivo: compare da solo arrivati all'ultima
          pagina (o ultimo spread) del capitolo, indipendentemente dal
          pannello controlli — vedi Fase 24. */}
      {isAtChapterEnd && nextChapter && (
        <div className="reader-next-chapter-bar">
          <button
            type="button"
            className="reader-next-chapter"
            onClick={() => navigate(`/reader/${nextChapter.id}`)}
          >
            {t('reader.nextChapter', { number: nextChapter.number })}
          </button>
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
            <button
              type="button"
              className={dimLevel > 0 ? 'active' : ''}
              aria-pressed={dimLevel > 0}
              aria-label={t(DIM_LABEL_KEYS[dimLevel])}
              title={t(DIM_LABEL_KEYS[dimLevel])}
              onClick={cycleDim}
            >
              <IconDim />
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
