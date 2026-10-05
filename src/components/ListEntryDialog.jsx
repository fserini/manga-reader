import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addListEntry, updateListEntry, getAllSeries, getMyListItems } from '../db.js';
import { normalizeTitle } from '../titles.js';
import './CategorizeForm.css';
import './ListEntryDialog.css';

// Quanti suggerimenti di serie mostrare sotto il titolo.
const MAX_SUGGESTIONS = 4;

// Aggiunta o modifica di una voce manuale della lista "Le mie serie" (Fase 34).
// `entry`: la voce da modificare (item di getMyListItems con manualId), o null
// per aggiungerne una. `defaultState`: lo stato proposto per una voce nuova.
//
// Collegamento con la libreria (Fase 34b): mentre si scrive il titolo, si
// suggeriscono le serie già in libreria; sceglierne una **collega** la voce a
// quella serie (seriesId): il legame regge anche a una rinomina della serie.
// Scrivere un titolo libero lo lascia senza legame esplicito (si prova comunque
// per nome). Un titolo già presente nella lista è rifiutato dal database (code
// 'duplicate').
function ListEntryDialog({ entry, defaultState, onClose, onSaved }) {
  const { t } = useTranslation();
  const editing = entry != null;
  const [title, setTitle] = useState(editing ? entry.title : '');
  // La serie collegata: { seriesId, title } o null. Una voce già collegata a una
  // serie che esiste ancora parte collegata; se la serie è stata rimossa, no.
  const [link, setLink] = useState(
    editing && entry.seriesId != null ? { seriesId: entry.seriesId, title: entry.title } : null,
  );
  // Una voce manuale ha solo due stati scelti dall'utente: da leggere, letto.
  const [state, setState] = useState(editing && entry.state === 'done' ? 'done' : editing ? 'toread' : defaultState);
  const [note, setNote] = useState(editing ? entry.note : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Le serie tra cui suggerire: quelle in libreria che NON sono già nella lista
  // (aggiungerle sarebbe un duplicato). La serie di questa stessa voce, se la si
  // sta modificando, resta selezionabile.
  const [candidates, setCandidates] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [series, items] = await Promise.all([getAllSeries(), getMyListItems()]);
      if (cancelled) return;
      // Una serie è "già presa" se è nella lista, tranne quella di questa voce.
      const isOwn = (item) => entry != null && item.manualId === entry.manualId;
      const taken = new Set(items.filter((item) => item.seriesId != null && !isOwn(item)).map((item) => item.seriesId));
      setCandidates(series.filter((candidate) => !taken.has(candidate.id)));
    })().catch(() => {}); // senza i suggerimenti il form funziona lo stesso
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const query = normalizeTitle(title);
  const suggestions =
    !link && title.trim().length >= 2
      ? candidates.filter((candidate) => normalizeTitle(candidate.title).includes(query)).slice(0, MAX_SUGGESTIONS)
      : [];

  function handleTitleChange(event) {
    setTitle(event.target.value);
    setLink(null); // cambiare il testo scollega: il titolo non è più quello della serie
    setError(null);
  }

  function pickSuggestion(series) {
    setTitle(series.title);
    setLink({ seriesId: series.id, title: series.title });
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t('myList.errors.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      const data = { title, state, note, seriesId: link?.seriesId ?? null };
      if (editing) await updateListEntry(entry.manualId, data);
      else await addListEntry(data);
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
            onChange={handleTitleChange}
            placeholder={t('myList.entry.titlePlaceholder')}
            autoComplete="off"
            autoFocus
          />
        </label>

        {suggestions.length > 0 && (
          <ul className="led-suggest" aria-label={t('myList.entry.suggestionsAria')}>
            {suggestions.map((series) => (
              <li key={series.id}>
                <button type="button" onClick={() => pickSuggestion(series)}>
                  <span>{series.title}</span>
                  <small>{t('myList.tagInLibrary')}</small>
                </button>
              </li>
            ))}
          </ul>
        )}

        {link && <p className="led-linked">{t('myList.entry.linked')}</p>}

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
