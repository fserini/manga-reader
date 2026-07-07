import { useState } from 'react';
import JSZip from 'jszip';
import { Archive } from 'libarchive.js';

Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;

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

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    pages.forEach((page) => URL.revokeObjectURL(page));
    setPages([]);
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

  return (
    <div>
      <h1>Lettore</h1>
      <input type="file" accept=".cbz,.cbr" onChange={handleFileChange} />

      {error && <p role="alert">{error}</p>}

      <div>
        {pages.map((pageUrl, index) => (
          <img
            key={pageUrl}
            src={pageUrl}
            alt={`Pagina ${index + 1}`}
            style={{ display: 'block', width: '100%' }}
          />
        ))}
      </div>
    </div>
  );
}

export default Reader;
