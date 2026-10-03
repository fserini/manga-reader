import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setSeriesTags } from '../db.js';
import './TagsDialog.css';

// Un tag è una parola libera: spazi ai bordi tolti, vuoti scartati, e un
// "duplicato" si riconosce senza badare alle maiuscole (Shonen = shonen).
function addTag(tags, raw) {
  const tag = raw.trim();
  if (!tag) return tags;
  if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

// Modifica dei tag liberi di una serie (Fase 25). allTags: tutti i tag già
// usati in libreria, offerti come suggerimenti rapidi per non riscrivere (e
// sbagliare) le stesse parole.
function TagsDialog({ series, allTags, onClose, onSaved }) {
  const { t } = useTranslation();
  const [tags, setTags] = useState(series.tags ?? []);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const suggestions = allTags.filter(
    (candidate) => !tags.some((existing) => existing.toLowerCase() === candidate.toLowerCase()),
  );

  function commitDraft() {
    setTags((current) => addTag(current, draft));
    setDraft('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Un tag scritto ma non ancora "aggiunto" non va perso al salvataggio.
      await setSeriesTags(series.id, addTag(tags, draft));
      onSaved();
    } catch {
      setError(t('tagsDialog.error'));
      setSaving(false);
    }
  }

  return (
    <div className="tags-overlay" role="dialog" aria-modal="true" aria-labelledby="tags-title">
      <div className="tags-panel">
        <h2 id="tags-title">{t('tagsDialog.title', { title: series.title })}</h2>
        <p className="tags-hint">{t('tagsDialog.hint')}</p>

        {tags.length > 0 && (
          <ul className="tags-list">
            {tags.map((tag) => (
              <li key={tag} className="tags-chip">
                <span>{tag}</span>
                <button
                  type="button"
                  aria-label={t('tagsDialog.removeTag', { tag })}
                  onClick={() => setTags((current) => current.filter((existing) => existing !== tag))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="tags-add">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('tagsDialog.placeholder')}
            aria-label={t('tagsDialog.placeholder')}
            autoFocus
          />
          <button type="button" onClick={commitDraft} disabled={!draft.trim()}>
            {t('tagsDialog.add')}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="tags-suggestions">
            <span className="tags-hint">{t('tagsDialog.suggestions')}</span>
            <ul className="tags-list">
              {suggestions.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    className="tags-suggestion"
                    onClick={() => setTags((current) => addTag(current, tag))}
                  >
                    + {tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="tags-error" role="alert">
            {error}
          </p>
        )}

        <div className="tags-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            {t('tagsDialog.cancel')}
          </button>
          <button type="button" className="tags-save" onClick={handleSave} disabled={saving}>
            {saving ? t('tagsDialog.saving') : t('tagsDialog.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TagsDialog;
