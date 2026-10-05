import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReadingStats, resetReadingStats } from '../db.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';
import './StatsCard.css';

// Card Statistiche della scheda Profilo (Fase 35). Non è cliccabile: l'unico
// gesto è l'icona di reset in alto a destra, che chiede conferma. Mostra i
// conteggi della libreria (serie, volumi, capitoli: non si azzerano) e le
// pagine lette (l'unico contatore che il reset azzera; il progresso di lettura
// resta com'è, vedi resetReadingStats in db.js).
function StatsCard() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStats(await getReadingStats());
  }, []);

  useEffect(() => {
    let cancelled = false;
    getReadingStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {}); // solo un riepilogo: senza, il resto della scheda funziona
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmReset() {
    setConfirming(false);
    setMessage(null);
    setError(null);
    try {
      await resetReadingStats();
      await load();
      setMessage(t('stats.resetDone'));
    } catch {
      setError(t('stats.resetError'));
    }
  }

  const format = (value) => value.toLocaleString(i18n.resolvedLanguage);
  const tiles = stats
    ? [
        { key: 'series', value: stats.library.series },
        { key: 'volumes', value: stats.library.volumes },
        { key: 'chapters', value: stats.library.chapters },
        { key: 'pages', value: stats.pagesRead },
      ]
    : [];

  return (
    <section className="stats-card" aria-labelledby="stats-title">
      <div className="stats-card-head">
        <h2 id="stats-title">{t('stats.title')}</h2>
        <button
          type="button"
          className="stats-card-reset"
          aria-label={t('stats.resetAria')}
          title={t('stats.resetAria')}
          onClick={() => setConfirming(true)}
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {!stats && <p className="stats-card-note">{t('stats.loading')}</p>}
      {stats && (
        <dl className="stats-tiles">
          {tiles.map((tile) => (
            <div key={tile.key} className="stats-tile">
              <dt>{t(`stats.${tile.key}`)}</dt>
              <dd>{format(tile.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {message && (
        <p className="stats-card-note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="stats-card-error" role="alert">
          {error}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title={t('stats.resetTitle')}
          note={t('stats.resetNote')}
          confirmLabel={t('stats.resetConfirm')}
          cancelLabel={t('stats.cancel')}
          onConfirm={confirmReset}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

export default StatsCard;
