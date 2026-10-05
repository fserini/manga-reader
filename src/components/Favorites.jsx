import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFavoriteSeries, toggleSeriesFavorite } from '../db.js';
import { isHintDismissed, dismissHint } from '../hints.js';
import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
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
        <Icon name="reader" size={36} />
      </div>
    );
  }
  return <img className="fav-cover" src={url} alt="" />;
}

// Sezione dei preferiti: dalla Fase 33 solo le SERIE (volumi e capitoli non si
// segnano più; quelli già salvati restano nel database e nei backup ma non si
// mostrano). Il componente sta in ascolto dei cambi fatti nel Catalogo tramite
// la key passata dalla Libreria (vedi Library.jsx); in senso inverso, quando si
// toglie un preferito da qui avvisa la Libreria con onChanged, che fa
// aggiornare la stella nel Catalogo.
function Favorites({ onChanged }) {
  const { t } = useTranslation();
  const [series, setSeries] = useState([]);
  // Il suggerimento "nessun preferito ancora" (Fase 26) compare solo a elenco
  // caricato — altrimenti lampeggerebbe prima dei dati — e si può chiudere per
  // sempre.
  const [loaded, setLoaded] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => isHintDismissed('favorites'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const items = await getFavoriteSeries();
      if (!cancelled) {
        setSeries(items);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unstarSeries(item) {
    await toggleSeriesFavorite(item.id);
    setSeries(await getFavoriteSeries());
    onChanged?.();
  }

  if (series.length === 0) {
    if (!loaded || hintDismissed) return null;
    return (
      <EmptyState
        compact
        icon="star"
        title={t('favorites.hintTitle')}
        dismissLabel={t('favorites.hintDismiss')}
        onDismiss={() => {
          dismissHint('favorites');
          setHintDismissed(true);
        }}
      >
        {t('favorites.hintText')}
      </EmptyState>
    );
  }

  return (
    <div className="favorites">
      <section aria-labelledby="fav-series-heading">
        <h2 id="fav-series-heading">{t('favorites.seriesHeading')}</h2>
        <ul className="fav-row">
          {series.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="fav-card"
                onClick={() => unstarSeries(item)}
                title={t('favorites.unstar')}
              >
                <ItemCover blob={item.coverThumbnail} />
                <span className="fav-card-title">{item.title}</span>
                <span className="fav-star" aria-hidden="true">
                  <Icon name="star" filled />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default Favorites;
