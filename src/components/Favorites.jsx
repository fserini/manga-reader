import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getFavoriteSeries,
  getFavoriteVolumes,
  getFavoriteChapters,
  toggleSeriesFavorite,
  toggleVolumeFavorite,
  toggleChapterFavorite,
} from '../db.js';
import { verifyPermission, fileStillExists } from '../fileAccess.js';
import './Favorites.css';

// Miniatura di un elemento, con URL oggetto gestito (come nel Catalogo).
function ItemCover({ blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!url) {
    return (
      <div className="fav-cover fav-cover--placeholder" aria-hidden="true">
        📖
      </div>
    );
  }
  return <img className="fav-cover" src={url} alt="" />;
}

// Sezione dedicata ai preferiti: serie e volumi (mostrati per riconoscerli a
// colpo d'occhio, senza un'azione di apertura — non sono "leggibili" di per
// sé) e capitoli (apribili direttamente nel Lettore, come nelle sezioni di
// lettura). Il componente sta in ascolto di eventuali cambi fatti nel
// Catalogo tramite la key passata dalla Libreria (vedi Library.jsx).
function Favorites({ onLibraryChanged }) {
  const navigate = useNavigate();
  const [series, setSeries] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [notice, setNotice] = useState(null);

  // Ricarica i tre elenchi: usata sia al montaggio sia dopo ogni "togli dai
  // preferiti" fatto da qui. Non è un useCallback perché non serve come
  // dipendenza di nessun effetto — viene solo richiamata da gestori di eventi.
  async function loadFavorites() {
    const [seriesItems, volumeItems, chapterItems] = await Promise.all([
      getFavoriteSeries(),
      getFavoriteVolumes(),
      getFavoriteChapters(),
    ]);
    setSeries(seriesItems);
    setVolumes(volumeItems);
    setChapters(chapterItems);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [seriesItems, volumeItems, chapterItems] = await Promise.all([
        getFavoriteSeries(),
        getFavoriteVolumes(),
        getFavoriteChapters(),
      ]);
      if (!cancelled) {
        setSeries(seriesItems);
        setVolumes(volumeItems);
        setChapters(chapterItems);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unstarSeries(item) {
    await toggleSeriesFavorite(item.id);
    loadFavorites();
  }

  async function unstarVolume(item) {
    await toggleVolumeFavorite(item.id);
    loadFavorites();
  }

  async function unstarChapter(item) {
    await toggleChapterFavorite(item.chapterId);
    loadFavorites();
  }

  // Come nel Catalogo e nelle sezioni di lettura: permesso durante il gesto,
  // poi apertura. Se il file non c'è più, avvisa e chiede alla Libreria di
  // aggiornarsi.
  async function openChapter(item) {
    setNotice(null);
    if (!item.handle) {
      setNotice('File non disponibile.');
      return;
    }
    try {
      const granted = await verifyPermission(item.handle, 'read');
      if (!granted) {
        setNotice('Permesso di accesso al file negato.');
        return;
      }
      if (!(await fileStillExists(item.handle))) {
        setNotice('Il file non è più disponibile.');
        onLibraryChanged?.();
        return;
      }
      navigate(`/reader/${item.chapterId}`);
    } catch {
      setNotice('Impossibile accedere al file.');
    }
  }

  if (series.length === 0 && volumes.length === 0 && chapters.length === 0) return null;

  return (
    <div className="favorites">
      {notice && (
        <p className="fav-notice" role="alert">
          {notice}
        </p>
      )}

      {series.length > 0 && (
        <section aria-labelledby="fav-series-heading">
          <h2 id="fav-series-heading">Serie preferite</h2>
          <ul className="fav-row">
            {series.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="fav-card"
                  onClick={() => unstarSeries(item)}
                  title="Togli dai preferiti"
                >
                  <ItemCover blob={item.coverThumbnail} />
                  <span className="fav-card-title">{item.title}</span>
                  <span className="fav-star" aria-hidden="true">
                    ★
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {volumes.length > 0 && (
        <section aria-labelledby="fav-volumes-heading">
          <h2 id="fav-volumes-heading">Volumi preferiti</h2>
          <ul className="fav-row">
            {volumes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="fav-card"
                  onClick={() => unstarVolume(item)}
                  title="Togli dai preferiti"
                >
                  <ItemCover blob={item.coverThumbnail} />
                  <span className="fav-card-title">
                    {item.seriesTitle ? `${item.seriesTitle} · ` : ''}Volume {item.number}
                  </span>
                  <span className="fav-star" aria-hidden="true">
                    ★
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chapters.length > 0 && (
        <section aria-labelledby="fav-chapters-heading">
          <h2 id="fav-chapters-heading">Capitoli preferiti</h2>
          <ul className="fav-row">
            {chapters.map((item) => (
              <li key={item.chapterId} className="fav-chapter">
                <button type="button" className="fav-card" onClick={() => openChapter(item)}>
                  <ItemCover blob={item.thumbnail} />
                  <span className="fav-card-title">
                    {item.seriesTitle ? `${item.seriesTitle} · ` : ''}Cap {item.chapterNumber}
                  </span>
                  {item.volumeNumber != null && <span className="fav-card-sub">Volume {item.volumeNumber}</span>}
                </button>
                <button
                  type="button"
                  className="fav-unstar"
                  aria-label="Togli il capitolo dai preferiti"
                  onClick={() => unstarChapter(item)}
                >
                  ★
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default Favorites;
