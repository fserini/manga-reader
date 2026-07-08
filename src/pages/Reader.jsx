import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { Archive } from 'libarchive.js';
import './Reader.css';

Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;
const SPREAD_ASPECT_RATIO_THRESHOLD = 1;
const DOUBLE_TAP_DELAY_MS = 300;
const TAP_ZONE_RATIO = 0.3;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const READING_MODES = [
  { value: 'single', label: 'Pagina singola' },
  { value: 'spread', label: 'Doppia pagina' },
  { value: 'scroll', label: 'Scroll continuo' },
];

function naturalCompare(nameA, nameB) {
  return nameA.localeCompare(nameB, undefined, { numeric: true });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getTouchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

async function extractCbzPages(file) {
  const zip = await JSZip.loadAsync(file);
  const imageEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  return Promise.all(imageEntries.map((entry) => entry.async('blob')));
}

async function extractCbrPages(file) {
  const archive = await Archive.open(file);
  await archive.extractFiles();
  const filesArray = await archive.getFilesArray();

  return filesArray
    .filter(({ file: entry }) => IMAGE_EXTENSION_REGEX.test(entry.name))
    .sort((a, b) => naturalCompare(a.path + a.file.name, b.path + b.file.name))
    .map(({ file: entry }) => entry);
}

// Alcune edizioni esportano ogni tavola già come doppia pagina (un solo file
// più largo che alto). La tagliamo in due pagine logiche separate, sempre
// nello stesso ordine fisico [sinistra, destra]: chi la mostra deciderà
// l'ordine di lettura in base alla direzione scelta.
async function splitSpreadIfNeeded(blob) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  if (width / height <= SPREAD_ASPECT_RATIO_THRESHOLD) {
    bitmap.close();
    return [blob];
  }

  const halfWidth = Math.round(width / 2);

  const left = document.createElement('canvas');
  left.width = halfWidth;
  left.height = height;
  left.getContext('2d').drawImage(bitmap, 0, 0, halfWidth, height, 0, 0, halfWidth, height);

  const right = document.createElement('canvas');
  right.width = width - halfWidth;
  right.height = height;
  right
    .getContext('2d')
    .drawImage(bitmap, halfWidth, 0, width - halfWidth, height, 0, 0, width - halfWidth, height);

  bitmap.close();

  return Promise.all([
    new Promise((resolve) => left.toBlob(resolve)),
    new Promise((resolve) => right.toBlob(resolve)),
  ]);
}

function Reader() {
  const [pageGroups, setPageGroups] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readingDirection, setReadingDirection] = useState('rtl');
  const [interfaceVisible, setInterfaceVisible] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);

  const tapTimeoutRef = useRef(null);
  const pinchStateRef = useRef(null);

  const pages = pageGroups.flatMap((group) => (readingDirection === 'rtl' ? [...group].reverse() : group));

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    pageGroups.flat().forEach((url) => URL.revokeObjectURL(url));
    setPageGroups([]);
    setCurrentIndex(0);
    setError(null);
    setInterfaceVisible(true);

    const isCbr = /\.cbr$/i.test(file.name);

    try {
      const rawImages = isCbr ? await extractCbrPages(file) : await extractCbzPages(file);

      if (rawImages.length === 0) {
        setError('Nessuna immagine trovata in questo file.');
        return;
      }

      const splitImages = await Promise.all(rawImages.map(splitSpreadIfNeeded));
      setPageGroups(splitImages.map((images) => images.map((image) => URL.createObjectURL(image))));
    } catch {
      setError(`Impossibile leggere il file: non sembra un ${isCbr ? 'CBR' : 'CBZ'} valido.`);
    }
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
          <label className="reader-file-input">
            <input type="file" accept=".cbz,.cbr" onChange={handleFileChange} />
            Scegli file
          </label>

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
        </div>
      )}

      {error && (
        <p className="reader-error" role="alert">
          {error}
        </p>
      )}

      {pages.length === 0 && !error && (
        <div className="reader-empty">
          <p>Scegli un file CBZ o CBR per iniziare a leggere.</p>
        </div>
      )}

      {pages.length > 0 && mode === 'scroll' && (
        <div className="reader-pages reader-pages--scroll" onClick={handlePagesClick}>
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
