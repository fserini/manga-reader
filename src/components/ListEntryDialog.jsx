import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addListEntry, updateListEntry } from '../db.js';
import './CategorizeForm.css';
import './ListEntryDialog.css';

// Aggiunta o modifica di una voce manuale della lista "Le mie serie" (Fase 34).
// `entry`: la voce da modificare (item di getMyListItems con manualId), o null
// per aggiungerne una. `defaultState`: lo stato proposto per una voce nuova.
// Un titolo già presente nella lista è rifiutato dal database (code
// 'duplicate'): qui si traduce in un messaggio.
function ListEntryDialog({ entry, defaultState, onClose, onSaved }) {
  const { t } = useTranslation();
  const editing = entry != null;
  const [title, setTitle] = useState(editing ? entry.title : '');
  // Una voce manuale ha solo due stati scelti dall'utente: da leggere, letto.
  const [state, setState] = useState(editing && entry.state === 'done' ? 'done' : editing ? 'toread' : defaultState);
  const [note, setNote] = useState(editing ? entry.note : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t('myList.errors.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editing) await updateListEntry(entry.manualId, { title, state, note });
      else await addListEntry({ title, state, note });
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
            onChange={(event) => setTitle(event.target.value)}
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
