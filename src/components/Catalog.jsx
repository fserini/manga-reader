import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllSeries,
  getVolumesForSeries,
  getChaptersForVolume,
  getChaptersUnderSeries,
  getChaptersUnderVolume,
  removeSeries,
  removeVolume,
  removeChapter,
} from '../db.js';
import {
  verifyPermission,
  fileStillExists,
  isFileDeletionSupported,
  deleteFileFromHandle,
} from '../fileAccess.js';
import DeleteDialog from './DeleteDialog.jsx';
import './Catalog.css';

const canDeleteFiles = isFileDeletionSupported();

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

  const [notice, setNotice] = useState(null);
  // Elemento in attesa di conferma rimozione: { kind, item, label, note } o null.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  // Ricarica l'elenco del livello attualmente mostrato, dopo una rimozione.
  async function reloadCurrentLevel() {
    if (level === 'series') {
      setSeries(await getAllSeries());
    } else if (level === 'volumes' && currentSeries) {
      setVolumes(await getVolumesForSeries(currentSeries.id));
    } else if (level === 'chapters' && currentVolume) {
      setChapters(await getChaptersForVolume(currentVolume.id));
    }
  }

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
  // lo facciamo qui, nel gestore del tocco, prima di aprire il Lettore. Se il
  // file non esiste più, rimuoviamo automaticamente il riferimento morto.
  async function openChapter(chapter) {
    setNotice(null);
    try {
      const granted = await verifyPermission(chapter.handle, 'read');
      if (!granted) {
        setNotice('Permesso di accesso al file negato.');
        return;
      }
      if (!(await fileStillExists(chapter.handle))) {
        await removeChapter(chapter.id);
        await reloadCurrentLevel();
        setNotice('Il file non è più disponibile ed è stato rimosso dalla libreria.');
        return;
      }
      navigate(`/reader/${chapter.id}`);
    } catch {
      setNotice('Impossibile accedere al file: forse è stato spostato o eliminato.');
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

  function askDelete(kind, item, label, note) {
    setNotice(null);
    setDeleteTarget({ kind, item, label, note });
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
        setNotice(
          `Rimosso dalla libreria. ${filesFailed} file non è stato possibile eliminarlo dal dispositivo.`,
        );
      }
    } catch {
      setNotice('Rimozione non riuscita. Riprova.');
    } finally {
      setDeleteBusy(false);
    }
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

      {notice && (
        <p className="catalog-error" role="alert">
          {notice}
        </p>
      )}

      {level === 'series' && (
        <ul className="catalog-grid">
          {series.map((item) => (
            <li key={item.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openSeries(item)}>
                <Cover blob={item.coverThumbnail} alt="" />
                <span className="catalog-card-title">{item.title}</span>
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={`Rimuovi la serie ${item.title}`}
                onClick={() =>
                  askDelete('series', item, `la serie «${item.title}»`, 'Verranno rimossi anche i suoi volumi e capitoli.')
                }
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'volumes' && (
        <ul className="catalog-grid">
          {volumes.map((volume) => (
            <li key={volume.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openVolume(volume)}>
                <Cover blob={volume.coverThumbnail} alt="" />
                <span className="catalog-card-title">Volume {volume.number}</span>
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={`Rimuovi il volume ${volume.number}`}
                onClick={() =>
                  askDelete('volume', volume, `il volume ${volume.number}`, 'Verranno rimossi anche i suoi capitoli.')
                }
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      {level === 'chapters' && (
        <ul className="catalog-grid">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="catalog-card">
              <button type="button" className="catalog-card-main" onClick={() => openChapter(chapter)}>
                <Cover blob={chapter.thumbnail} alt="" />
                <span className="catalog-card-title">Capitolo {chapter.number}</span>
              </button>
              <button
                type="button"
                className="catalog-card-delete"
                aria-label={`Rimuovi il capitolo ${chapter.number}`}
                onClick={() => askDelete('chapter', chapter, `il capitolo ${chapter.number}`, null)}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

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
    </div>
  );
}

export default Catalog;
