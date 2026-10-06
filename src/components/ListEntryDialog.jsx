import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addListEntry, updateListEntry, renameSeries, saveSeriesListInfo } from '../db.js';
import './CategorizeForm.css';
import './ListEntryDialog.css';

// Aggiunta o modifica di un titolo della lista "Le mie serie" (Fase 34, estesa
// nella 37). `entry`: il titolo da modificare (item di getMyListItems), o null
// per aggiungerne uno nuovo. `defaultState`: lo stato proposto per un titolo nuovo.
//
// Due casi quando si modifica:
// - una voce manuale (non in libreria): titolo, stato e nota sono della voce;
// - una serie della libreria: il titolo è quello della serie (si rinomina come dal
//   Catalogo), mentre stato e nota si salvano in una voce collegata. Lo stato
//   scelto qui conta solo finché la serie non è stata iniziata: poi vince quello
//   ricavato dalla lettura.
//
// Un titolo già presente nella lista è rifiutato dal database (code 'duplicate').
// Poiché ora tutte le serie della libreria sono già in lista, aggiungere con "+"
// il titolo di una serie in libreria dà proprio quell'errore: per cambiarla si
// tocca la serie in modalità Modifica.
function ListEntryDialog({ entry, defaultState, onClose, onSaved }) {
  const { t } = useTranslation();
  const editing = entry != null;
  const inLibrary = editing && entry.lib;
  const [title, setTitle] = useState(editing ? entry.title : '');
  // Una voce manuale ha solo due stati scelti dall'utente: da leggere, letto.
  const [state, setState] = useState(editing ? (entry.manualState === 'done' ? 'done' : 'toread') : defaultState);
  const [note, setNote] = useState(editing ? entry.note : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const clean = title.trim();
    if (!clean) {
      setError(t('myList.errors.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (inLibrary) {
        if (clean !== entry.title) await renameSeries(entry.seriesId, clean);
        await saveSeriesListInfo(entry.seriesId, entry.manualId, { state, note });
      } else if (editing) {
        await updateListEntry(entry.manualId, { title: clean, state, note });
      } else {
        await addListEntry({ title: clean, state, note });
      }
      onSaved(state);
    } catch (saveError) {
      setError(saveError.code === 'duplicate' ? t('myList.errors.duplicate') : t('myList.errors.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <form className="cf-panel" onSubmit={handleSubmit}>
        <h2 id="entry-title" className="cf-title">
          {t(editing ? 'myList.entry.titleEdit' : 'myList.entry.titleAdd')}
        </h2>

        <label className="cf-field">
          <span>{t('myList.entry.titleLabel')}</span>
          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder={t('myList.entry.titlePlaceholder')}
            autoComplete="off"
            autoFocus
          />
        </label>

        <div className="cf-field">
          <span id="entry-state-label">{t('myList.entry.stateLabel')}</span>
          <div className="led-seg" role="radiogroup" aria-labelledby="entry-state-label">
            {['toread', 'done'].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={state === value}
                onClick={() => setState(value)}
              >
                {t(`myList.entry.state.${value}`)}
              </button>
            ))}
          </div>
          {inLibrary && entry.readState !== 'toread' && (
            <p className="led-hint">
              {t('myList.entry.readStateHint', { state: t(`myList.filters.${entry.readState}`) })}
            </p>
          )}
        </div>

        <label className="cf-field">
          <span>{t('myList.entry.noteLabel')}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('myList.entry.notePlaceholder')}
            rows={3}
          />
        </label>

        {error && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}

        <div className="cf-actions">
          <button type="button" className="cf-cancel" onClick={onClose} disabled={saving}>
            {t('myList.entry.cancel')}
          </button>
          <button type="submit" className="cf-save" disabled={saving}>
            {saving ? t('myList.entry.saving') : t('myList.entry.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ListEntryDialog;
