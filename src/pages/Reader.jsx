import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openChapterPages, makeThumbnail } from '../comicFile.js';
import { isLazyPage, resolvePageBlob } from '../pdfPages.js';
import { getFileExtension } from '../fileAccess.js';
import {
  getChapter,
  setChapterThumbnail,
  getReadingProgress,
  updateReadingProgress,
  setManualBookmark,
  getNextChapterInVolume,
} from '../db.js';
import { useAppChrome } from '../AppChromeContext.jsx';
import { useUiPreferences } from '../UiPreferencesContext.jsx';
import { enterFullscreen, exitFullscreen, isFullscreenActive } from '../fullscreen.js';
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

// Margine attorno alla vista entro cui una pagina di un PDF in modalità scroll
// viene disegnata (e, uscendone, rilasciata): circa uno schermo e mezzo sopra
// e sotto, così si legge senza vedere i segnaposto.
const LAZY_PAGE_MARGIN = '150% 0px';

// Una pagina di un PDF (Fase 28b): arriva come oggetto { ratio, load } e viene
// disegnata solo quando serve. In singola/doppia pagina serve subito (è quella
// mostrata); in scroll solo quando entra, o sta per entrare, nella vista
// (IntersectionObserver), e si rilascia quando se ne va lontano — altrimenti
// un volume da 200 pagine riempirebbe la memoria di immagini. Finché non è
// pronta tiene il suo posto con le proporzioni giuste, così lo scorrimento non
// salta. Un solo elemento radice, come le altre pagine: handleScroll conta i figli.
function LazyPage({ page, alt, style, observe }) {
  const rootRef = useRef(null);
  // Senza osservatore (singola/doppia pagina) la pagina serve subito.
  const [near, setNear] = useState(!observe);
  const [state, setState] = useState({ page: null, url: null, failed: false });

  useEffect(() => {
    if (!observe) return undefined;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: rootRef.current.parentElement, // il contenitore scorrevole
      rootMargin: LAZY_PAGE_MARGIN,
    });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [observe]);

  useEffect(() => {
    if (!near) return undefined;
    let cancelled = false;
    let url = null;
    page.load().then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState({ page, url: null, failed: true });
        return;
      }
      url = URL.createObjectURL(blob);
      setState({ page, url, failed: false });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [near, page]);

  // Lo stato appartiene alla pagina che l'ha prodotto: se nel frattempo la
  // pagina è cambiata, non si mostra l'immagine della precedente.
  const current = state.page === page ? state : { url: null, failed: false };
  if (current.failed) return <Page page={null} alt={alt} />;

  // Singola/doppia pagina: l'immagine è direttamente l'elemento della pagina,
  // come per gli archivi; finché non è pronta, un riquadro vuoto.
  if (!observe) {
    return current.url ? (
      <img src={current.url} alt={alt} style={style} />
    ) : (
      <div className="reader-page-loading" aria-hidden="true" />
    );
  }
  // Scroll: un contenitore stabile (è lui che l'osservatore tiene d'occhio)
  // con le proporzioni della pagina, che contiene l'immagine solo finché la
  // pagina è vicina alla vista.
  return (
    <div ref={rootRef} className="reader-page-lazy" style={{ aspectRatio: page.ratio }}>
      {near && current.url && <img src={current.url} alt={alt} />}
    </div>
  );
}

// Una pagina, o un segnaposto se url è null (immagine danneggiata,
// rilevata durante l'estrazione): non fa fallire la lettura del resto
// del capitolo, si salta solo quella pagina. `page` può anche essere una
// pagina pigra di un PDF, vedi LazyPage.
function Page({ page, alt, style, observe = false }) {
  const { t } = useTranslation();

  if (isLazyPage(page)) return <LazyPage page={page} alt={alt} style={style} observe={observe} />;
  const url = page;
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
  const { prefs } = useUiPreferences();

  const [pageGroups, setPageGroups] = useState([]);
  // Il capitolo (id) a cui appartengono pageGroups, o null: vedi il
  // salvataggio del progresso.
  const [loadedChapterId, setLoadedChapterId] = useState(null);
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
  // Chiusura del documento aperto (vedi openChapterPages): fa qualcosa solo
  // per i PDF.
  const disposePagesRef = useRef(() => {});
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

  // Schermo intero vero (Fase 36): quando i controlli si nascondono, e se
  // l'utente lo ha scelto, il Lettore chiede al browser lo schermo intero, che
  // copre anche la barra di stato di sistema. La richiesta parte dal tocco che
  // ha nascosto i controlli: il browser la accetta solo entro qualche secondo
  // da un gesto, e qui ci arriva dopo il breve ritardo del doppio tocco.
  const wantsFullscreen = prefs.fullscreen === 'on';
  useEffect(() => {
    if (wantsFullscreen && !interfaceVisible) enterFullscreen();
    else exitFullscreen();
  }, [interfaceVisible, wantsFullscreen]);

  // Si può uscire dallo schermo intero anche col gesto del sistema o con Esc:
  // in quel caso i controlli devono tornare, altrimenti il Lettore resterebbe
  // "a schermo intero" per l'app ma non per il browser.
  useEffect(() => {
    function handleFullscreenChange() {
      if (!isFullscreenActive()) setInterfaceVisible(true);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      exitFullscreen(); // lasciando il Lettore si esce sempre dallo schermo intero
    };
  }, []);

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
    // Per un PDF, chiude anche il documento (e il suo worker): le pagine
    // pigre non servono più.
    disposePagesRef.current();
    disposePagesRef.current = () => {};
  }, []);

  // Estrae e mostra le pagine di un file. Se chapterIdForThumb è indicato,
  // genera anche la miniatura e la salva (copertina del catalogo).
  const openFile = useCallback(
    async (file, chapterIdForThumb = null) => {
      revokeCurrentUrls();
      setPageGroups([]);
      setLoadedChapterId(null);
      setCurrentIndex(0);
      setManualBookmarkPage(null);
      setNextChapter(null);
      setError(null);
      setInterfaceVisible(true);
      explicitModeThisChapterRef.current = false;

      try {
        const { groups, dispose } = await openChapterPages(file);
        disposePagesRef.current = dispose;
        if (groups.length === 0) {
          setError(t('reader.noImagesFound'));
          return;
        }

        const urlGroups = groups.map((group) =>
          group.map((blob) => {
            if (!blob) return null; // pagina illeggibile: nessun URL da creare/revocare
            if (isLazyPage(blob)) return blob; // pagina di un PDF: si disegna quando serve
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
        setLoadedChapterId(chapterIdForThumb);

        if (chapterIdForThumb != null && groups[0]?.[0]) {
          resolvePageBlob(groups[0][0])
            .then((first) => first && makeThumbnail(first))
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
  //
  // Si salva solo se le pagine mostrate sono davvero quelle di QUESTO capitolo
  // (loadedChapterId): passando da un capitolo all'altro dentro il Lettore
  // ("Capitolo successivo") il componente resta lo stesso, e per un istante
  // chapterId è già il nuovo mentre pagine e indice sono ancora del vecchio —
  // senza questo controllo, la pagina del capitolo precedente finiva salvata
  // come progresso del nuovo, che poi si riapriva a metà.
  useEffect(() => {
    if (!chapterId || totalPages === 0 || loadedChapterId !== Number(chapterId)) return;
    updateReadingProgress(Number(chapterId), { lastPageRead: currentIndex, totalPages });
  }, [chapterId, currentIndex, totalPages, loadedChapterId]);

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
      {error && (
        <p className="reader-error" role="alert">
          {error}
        </p>
      )}

      {pages.length === 0 && !error && (
        <div className="reader-empty">
          <p>{t('reader.loadingChapter')}</p>
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
            <Page
              key={typeof pageUrl === 'string' ? pageUrl : `page-${index}`}
              page={pageUrl}
              observe
              alt={t('reader.pageAlt', { number: index + 1 })}
            />
          ))}
        </div>
      )}

      {pages.length > 0 && mode === 'single' && (
        <div className="reader-pages reader-pages--single" {...pagesInteractionProps}>
          <Page page={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
        </div>
      )}

      {pages.length > 0 && mode === 'spread' && (
        <div className="reader-pages reader-pages--spread" {...pagesInteractionProps}>
          {readingDirection === 'rtl' ? (
            <>
              {secondPageOfSpread !== undefined && (
                <Page page={secondPageOfSpread} alt={t('reader.pageAlt', { number: currentIndex + 2 })} style={zoomStyle} />
              )}
              <Page page={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
            </>
          ) : (
            <>
              <Page page={pages[currentIndex]} alt={t('reader.pageAlt', { number: currentIndex + 1 })} style={zoomStyle} />
              {secondPageOfSpread !== undefined && (
                <Page page={secondPageOfSpread} alt={t('reader.pageAlt', { number: currentIndex + 2 })} style={zoomStyle} />
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
      {/* A controlli nascosti (schermo intero) il filo segue la scelta in
          Impostazioni: visibile come prima, trasparente (sovrapposto alla pagina,
          senza sfondo) o del tutto nascosto — Fase 36. */}
      {pages.length > 0 && (interfaceVisible || prefs.thread !== 'hidden') && (
        <div
          className={`reader-progress${!interfaceVisible && prefs.thread === 'transparent' ? ' reader-progress--ghost' : ''}`}
        >
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
            {/* La direzione ha due stati e nessuno è "spento": il pulsante ha sempre
                uno sfondo e una sigla (RTL / LTR) che dicono quale è attivo (Fase 33). */}
            <button
              type="button"
              className="reader-direction"
              onClick={toggleReadingDirection}
              aria-label={readingDirection === 'rtl' ? t('reader.directionRtl') : t('reader.directionLtr')}
              title={readingDirection === 'rtl' ? t('reader.directionRtl') : t('reader.directionLtr')}
            >
              <IconDirection />
              <span>{readingDirection === 'rtl' ? 'RTL' : 'LTR'}</span>
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
