import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renameSeries, renumberVolume } from '../db.js';
import './CategorizeForm.css';

// Rinomina di una Serie (il titolo) o di un Volume (il numero), Fase 27.
// `target`: { kind: 'series' | 'volume', item }. Riusa l'aspetto del form di
// categorizzazione (.cf-*). Le regole stanno nel database (renameSeries,
// renumberVolume): un nome già esistente viene rifiutato con code 'duplicate',
// qui lo si traduce in un messaggio.
function RenameDialog({ target, onClose, onSaved }) {
  const { t } = useTranslation();
  const isSeries = target.kind === 'series';
  const [value, setValue] = useState(isSeries ? target.item.title : String(target.item.number));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (isSeries) {
      if (!value.trim()) {
        setError(t('rename.errors.emptyTitle'));
        return;
      }
    } else {
      const number = Number(value);
      if (value.trim() === '' || !Number.isFinite(number) || number < 0) {
        setError(t('rename.errors.invalidNumber'));
        return;
      }
    }

    setSaving(true);
    try {
      if (isSeries) await renameSeries(target.item.id, value);
      else await renumberVolume(target.item.id, Number(value));
      onSaved();
    } catch (saveError) {
      setError(
        saveError.code === 'duplicate'
          ? t(isSeries ? 'rename.errors.duplicateSeries' : 'rename.errors.duplicateVolume')
          : t('rename.errors.saveFailed'),
      );
      setSaving(false);
    }
  }

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <form className="cf-panel" onSubmit={handleSubmit}>
        <h2 id="rename-title" className="cf-title">
          {t(isSeries ? 'rename.titleSeries' : 'rename.titleVolume')}
        </h2>
        <p className="cf-filename">{target.label}</p>

        <label className="cf-field">
          <span>{t(isSeries ? 'rename.seriesLabel' : 'rename.volumeLabel')}</span>
          <input
            type={isSeries ? 'text' : 'number'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            min={isSeries ? undefined : '0'}
            autoFocus
          />
        </label>

        {!isSeries && <p className="cf-prefilled">{t('rename.volumeNote')}</p>}

        {error && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}

        <div className="cf-actions">
          <button type="button" className="cf-cancel" onClick={onClose} disabled={saving}>
            {t('categorizeForm.cancel')}
          </button>
          <button type="submit" className="cf-save" disabled={saving}>
            {saving ? t('categorizeForm.saving') : t('categorizeForm.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RenameDialog;
