import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllSeries, getVolumesForSeries, getChaptersForVolume } from '../db.js';
import { verifyPermission } from '../fileAccess.js';
import './Catalog.css';

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

function Catalog() {
  const navigate = useNavigate();

  const [series, setSeries] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);

  // Livello di navigazione corrente e le voci selezionate lungo il percorso.
  const [level, setLevel] = useState('series'); // 'series' | 'volumes' | 'chapters'
  const [currentSeries, setCurrentSeries] = useState(null);
  const [currentVolume, setCurrentVolume] = useState(null);

  const [permissionError, setPermissionError] = useState(null);

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

  async function openSeries(item) {
    setCurrentSeries(item);
    setVolumes(await getVolumesForSeries(item.id));
    setLevel('volumes');
  }

  async function openVolume(volume) {
    setCurrentVolume(volume);
    setChapters(await getChaptersForVolume(volume.id));
    setLevel('chapters');
  }

  // Il permesso di lettura sull'handle va (ri)chiesto durante un gesto utente:
  // lo facciamo qui, nel gestore del tocco, prima di aprire il Lettore.
  async function openChapter(chapter) {
    setPermissionError(null);
    try {
      const granted = await verifyPermission(chapter.handle, 'read');
      if (!granted) {
        setPermissionError('Permesso di accesso al file negato.');
        return;
      }
      navigate(`/reader/${chapter.id}`);
    } catch {
      setPermissionError('Impossibile accedere al file: forse è stato spostato o eliminato.');
    }
  }

  function goToSeries() {
    setLevel('series');
    setCurrentSeries(null);
    setCurrentVolume(null);
  }

  function goToVolumes() {
    setLevel('volumes');
    setCurrentVolume(null);
  }

  if (loading) {
    return <p className="catalog-empty">Caricamento del catalogo…</p>;
  }

  if (series.length === 0) {
    return <p className="catalog-empty">Nessuna serie ancora. Categorizza i capitoli importati per popolarla.</p>;
  }

  return (
    <div className="catalog">
      <nav className="catalog-breadcrumb" aria-label="Percorso">
        <button type="button" className="catalog-crumb" onClick={goToSeries} disabled={level === 'series'}>
          Serie
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
            <span className="catalog-crumb catalog-crumb--current">Volume {currentVolume.number}</span>
          </>
        )}
      </nav>

      {permissionError && (
        <p className="catalog-error" role="alert">
          {permissionError}
        </p>
      )}

      {level === 'series' && (
        <ul className="catalog-grid">
          {series.map((item) => (
            <li key={item.id}>
              <button type="button" className="catalog-card" onClick={() => openSeries(item)}>
                <Cover blob={item.coverThumbnail} alt="" />
                <span className="catalog-card-title">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'volumes' && (
        <ul className="catalog-grid">
          {volumes.map((volume) => (
            <li key={volume.id}>
              <button type="button" className="catalog-card" onClick={() => openVolume(volume)}>
                <Cover blob={volume.coverThumbnail} alt="" />
                <span className="catalog-card-title">Volume {volume.number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'chapters' && (
        <ul className="catalog-grid">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <button type="button" className="catalog-card" onClick={() => openChapter(chapter)}>
                <Cover blob={chapter.thumbnail} alt="" />
                <span className="catalog-card-title">Capitolo {chapter.number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Catalog;
