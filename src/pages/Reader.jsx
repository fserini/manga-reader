import { useState } from 'react';
import JSZip from 'jszip';
import { Archive } from 'libarchive.js';
import './Reader.css';

Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;

const READING_MODES = [
  { value: 'single', label: 'Pagina singola' },
  { value: 'spread', label: 'Doppia pagina' },
  { value: 'scroll', label: 'Scroll continuo' },
];

function naturalCompare(nameA, nameB) {
  return nameA.localeCompare(nameB, undefined, { numeric: true });
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

function Reader() {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('single');
  const [currentIndex, setCurrentIndex] = useState(0);

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    pages.forEach((page) => URL.revokeObjectURL(page));
    setPages([]);
    setCurrentIndex(0);
    setError(null);

    const isCbr = /\.cbr$/i.test(file.name);

    try {
      const images = isCbr ? await extractCbrPages(file) : await extractCbzPages(file);

      if (images.length === 0) {
        setError('Nessuna immagine trovata in questo file.');
        return;
      }

      setPages(images.map((image) => URL.createObjectURL(image)));
    } catch {
      setError(`Impossibile leggere il file: non sembra un ${isCbr ? 'CBR' : 'CBZ'} valido.`);
    }
  }

  const step = mode === 'spread' ? 2 : 1;
  const isFirstPage = currentIndex === 0;
  const isLastPage = currentIndex >= pages.length - 1;

  function clampIndex(index) {
    return Math.max(0, Math.min(index, pages.length - 1));
  }

  function goToPrevious() {
    setCurrentIndex((index) => clampIndex(index - step));
  }

  function goToNext() {
    setCurrentIndex((index) => clampIndex(index + step));
  }

  return (
    <div className="reader">
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
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

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
        <div className="reader-pages reader-pages--scroll">
          {pages.map((pageUrl, index) => (
            <img key={pageUrl} src={pageUrl} alt={`Pagina ${index + 1}`} />
          ))}
        </div>
      )}

      {pages.length > 0 && mode === 'single' && (
        <div className="reader-pages reader-pages--single">
          <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} />
        </div>
      )}

      {pages.length > 0 && mode === 'spread' && (
        <div className="reader-pages reader-pages--spread">
          <img src={pages[currentIndex]} alt={`Pagina ${currentIndex + 1}`} />
          {pages[currentIndex + 1] && (
            <img src={pages[currentIndex + 1]} alt={`Pagina ${currentIndex + 2}`} />
          )}
        </div>
      )}

      {pages.length > 0 && mode !== 'scroll' && (
        <div className="reader-nav">
          <button type="button" onClick={goToPrevious} disabled={isFirstPage}>
            ‹ Precedente
          </button>
          <span>
            {currentIndex + 1}
            {mode === 'spread' && pages[currentIndex + 1] ? `-${currentIndex + 2}` : ''} / {pages.length}
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
