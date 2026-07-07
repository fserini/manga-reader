import { useState } from 'react';
import JSZip from 'jszip';

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp)$/i;

function Reader() {
  const [pages, setPages] = useState([]);
  const [error, setError] = useState(null);

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    pages.forEach((page) => URL.revokeObjectURL(page));
    setPages([]);
    setError(null);

    try {
      const zip = await JSZip.loadAsync(file);
      const imageEntries = Object.values(zip.files)
        .filter((entry) => !entry.dir && IMAGE_EXTENSION_REGEX.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      if (imageEntries.length === 0) {
        setError('Nessuna immagine trovata in questo file CBZ.');
        return;
      }

      const imageUrls = await Promise.all(
        imageEntries.map(async (entry) => {
          const blob = await entry.async('blob');
          return URL.createObjectURL(blob);
        }),
      );
      setPages(imageUrls);
    } catch {
      setError('Impossibile leggere il file: non sembra un CBZ valido.');
    }
  }

  return (
    <div>
      <h1>Lettore</h1>
      <input type="file" accept=".cbz" onChange={handleFileChange} />

      {error && <p role="alert">{error}</p>}

      <div>
        {pages.map((pageUrl, index) => (
          <img key={pageUrl} src={pageUrl} alt={`Pagina ${index + 1}`} width="100%" />
        ))}
      </div>
    </div>
  );
}

export default Reader;
