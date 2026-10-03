import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getChaptersUnderSeries,
  getChaptersUnderVolume,
  setCustomCover,
  clearCustomCover,
} from '../db.js';
import { makeThumbnail } from '../comicFile.js';
import './CoverPicker.css';

// Miniatura di un capitolo-candidato, con URL oggetto gestito (come Cover nel
// Catalogo).
function CandidateThumb({ blob, label, onPick }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <button type="button" className="cover-picker-thumb" onClick={onPick} aria-label={label}>
      <img src={url} alt="" />
    </button>
  );
}

// Scelta manuale della copertina di una Serie o di un Volume (Fase 25): fra le
// copertine dei capitoli contenuti, oppure caricando un'immagine. kind è
// 'series' | 'volume'; item è la riga del DB; label è il nome da mostrare nel
// titolo; onClose chiude, onSaved avvisa il Catalogo di ricaricarsi.
function CoverPicker({ kind, item, label, onClose, onSaved }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const chapters =
        kind === 'series' ? await getChaptersUnderSeries(item.id) : await getChaptersUnderVolume(item.id);
      if (cancelled) return;
      setCandidates(
        chapters.filter((chapter) => chapter.thumbnail).sort((a, b) => a.number - b.number),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, item.id]);

  async function save(thumbnail) {
    setBusy(true);
    setError(null);
    try {
      await setCustomCover(kind, item.id, thumbnail);
      onSaved();
    } catch {
      setError(t('coverPicker.error'));
      setBusy(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const thumbnail = await makeThumbnail(file);
      if (!thumbnail) throw new Error('empty thumbnail');
      await setCustomCover(kind, item.id, thumbnail);
      onSaved();
    } catch {
      setError(t('coverPicker.error'));
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setError(null);
    try {
      await clearCustomCover(kind, item.id);
      onSaved();
    } catch {
      setError(t('coverPicker.error'));
      setBusy(false);
    }
  }

  return (
    <div className="cover-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="cover-picker-title">
      <div className="cover-picker-panel">
        <h2 id="cover-picker-title">{t('coverPicker.title', { label })}</h2>
        <p className="cover-picker-hint">{t('coverPicker.hint')}</p>

        {loading ? (
          <p className="cover-picker-hint">{t('library.loading')}</p>
        ) : candidates.length === 0 ? (
          <p className="cover-picker-hint">{t('coverPicker.noCandidates')}</p>
        ) : (
          <div className="cover-picker-grid">
            {candidates.map((chapter) => (
              <CandidateThumb
                key={chapter.id}
                blob={chapter.thumbnail}
                label={t('coverPicker.useChapter', { number: chapter.number })}
                onPick={() => !busy && save(chapter.thumbnail)}
              />
            ))}
          </div>
        )}

        {error && (
          <p className="cover-picker-error" role="alert">
            {error}
          </p>
        )}

        <div className="cover-picker-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {t('coverPicker.upload')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="cover-picker-file"
            onChange={handleUpload}
          />
          {item.coverCustom && (
            <button type="button" onClick={handleReset} disabled={busy}>
              {t('coverPicker.reset')}
            </button>
          )}
          <button type="button" className="cover-picker-close" onClick={onClose} disabled={busy}>
            {t('coverPicker.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CoverPicker;
