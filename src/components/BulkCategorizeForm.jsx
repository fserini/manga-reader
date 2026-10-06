import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAllSeries, getVolumesForSeries, categorizeChaptersBatch } from '../db.js';
import { guessChapterNumber } from '../chapterNumber.js';
import { loadLastSeriesId, saveLastSeriesId } from '../lastSeries.js';
import './CategorizeForm.css';
import './BulkCategorizeForm.css';

// Valore speciale del menu a tendina per la voce "crea nuova serie".
const NEW = 'new';

// Un numero valido (finito, non negativo) da un campo di testo, o null.
function toNumber(text) {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Categorizzazione di più capitoli insieme (Fase 23). Serie unica per tutti;
// il volume è uno solo per tutti ("stesso volume", attivo di default) oppure
// uno per riga; il numero di capitolo è sempre per riga. Serie e volume partono
// vuoti, con l'esempio come segnaposto: dal nome dei file non si ricava più nulla
// (decisione di Federico, Fase 33), salvo il numero del capitolo di ogni riga,
// quando lo si capisce (Fase 38).
//
// La serie parte da scegliere, ma se ne propone una: l'ultima in cui si è
// categorizzato qualcosa (Fase 38). Si accetta toccando il riquadro tratteggiato
// sotto il menu, oppure premendo Tab sul menu ancora vuoto; non si sceglie mai
// al posto dell'utente.
//
// Il volume si indica per NUMERO, non scegliendolo da un elenco: se la serie ha
// già quel volume lo si usa, altrimenti si crea (vedi categorizeChaptersBatch).
// Un campo solo vale per i due casi, e i volumi già presenti si elencano come
// promemoria.
function BulkCategorizeForm({ chapters, onCancel, onDone }) {
  const { t } = useTranslation();
  const [series, setSeries] = useState([]);
  const [seriesChoice, setSeriesChoice] = useState('');
  const seriesSelectRef = useRef(null);
  const [lastSeriesId] = useState(loadLastSeriesId);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  // I volumi della serie scelta, con la serie a cui appartengono: se nel
  // frattempo la scelta è cambiata, l'elenco non è più quello giusto.
  const [loadedVolumes, setLoadedVolumes] = useState({ seriesChoice: null, list: [] });

  const [sameVolume, setSameVolume] = useState(true);
  const [sharedVolume, setSharedVolume] = useState('');
  // Una riga per capitolo: il suo volume (usato solo se sameVolume è falso) e
  // il suo numero, entrambi come testo dei campi.
  const [rows, setRows] = useState(() =>
    chapters.map((chapter) => ({
      id: chapter.id,
      fileName: chapter.fileName,
      volume: '',
      number: guessChapterNumber(chapter.fileName),
    })),
  );
  // Quanti numeri sono stati precompilati, per dirlo una volta sola sopra l'elenco.
  const [prefilledCount] = useState(() => rows.filter((row) => row.number !== '').length);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const creatingNewSeries = seriesChoice === NEW;
  // La serie da suggerire: l'ultima usata, se esiste ancora. Solo finché non se
  // ne è scelta una.
  const suggestedSeries = series.find((item) => item.id === lastSeriesId);
  const showSuggestion = seriesChoice === '' && suggestedSeries !== undefined;
  const existingVolumes = loadedVolumes.seriesChoice === seriesChoice ? loadedVolumes.list : [];

  // All'apertura: carica le serie tra cui scegliere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getAllSeries();
      if (!cancelled) setSeries(list);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // I volumi già presenti nella serie scelta, come promemoria sotto il campo.
  useEffect(() => {
    if (seriesChoice === '' || seriesChoice === NEW) return undefined;
    let cancelled = false;
    (async () => {
      const list = await getVolumesForSeries(Number(seriesChoice));
      if (!cancelled) setLoadedVolumes({ seriesChoice, list });
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesChoice]);

  function chooseSeries(value) {
    setSeriesChoice(value);
    setError(null);
  }

  function acceptSuggestion() {
    chooseSeries(String(suggestedSeries.id));
    seriesSelectRef.current?.focus();
  }

  // Tab sul menu ancora vuoto sceglie il suggerimento e resta sul menu; il Tab
  // successivo passa al campo dopo, come sempre. Con Maiusc+Tab non si interviene.
  function handleSeriesKeyDown(event) {
    if (event.key === 'Tab' && !event.shiftKey && showSuggestion) {
      event.preventDefault();
      acceptSuggestion();
    }
  }

  function updateRow(id, patch) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  // Riattivando i volumi per riga, le righe senza volume ereditano quello
  // condiviso: si parte da un valore sensato, non da campi vuoti.
  function handleSameVolumeChange(checked) {
    setSameVolume(checked);
    if (!checked) {
      setRows((current) => current.map((row) => (row.volume === '' ? { ...row, volume: sharedVolume } : row)));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (seriesChoice === '') {
      setError(t('categorizeForm.errors.chooseSeries'));
      return;
    }
    if (creatingNewSeries && !newSeriesTitle.trim()) {
      setError(t('categorizeForm.errors.newSeriesNameRequired'));
      return;
    }

    const sharedNumber = toNumber(sharedVolume);
    if (sameVolume && sharedNumber === null) {
      setError(t('categorizeForm.errors.newVolumeNumberInvalid'));
      return;
    }

    const assignments = [];
    for (const row of rows) {
      const number = toNumber(row.number);
      const volumeNumber = sameVolume ? sharedNumber : toNumber(row.volume);
      if (volumeNumber === null) {
        setError(t('bulkCategorize.errors.rowVolume', { fileName: row.fileName }));
        return;
      }
      if (number === null) {
        setError(t('bulkCategorize.errors.rowNumber', { fileName: row.fileName }));
        return;
      }
      assignments.push({ chapterId: row.id, volumeNumber, number });
    }

    setSaving(true);
    try {
      const savedSeriesId = await categorizeChaptersBatch({
        seriesId: creatingNewSeries ? null : Number(seriesChoice),
        newSeriesTitle: creatingNewSeries ? newSeriesTitle.trim() : null,
        assignments,
      });
      saveLastSeriesId(savedSeriesId);
      onDone();
    } catch {
      setError(t('categorizeForm.errors.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="bcf-title">
      <form className="cf-panel bcf-panel" onSubmit={handleSubmit}>
        <h2 id="bcf-title" className="cf-title">
          {t('bulkCategorize.title', { count: rows.length })}
        </h2>

        <label className="cf-field">
          <span>{t('categorizeForm.series')}</span>
          <select
            ref={seriesSelectRef}
            value={seriesChoice}
            onChange={(event) => chooseSeries(event.target.value)}
            onKeyDown={handleSeriesKeyDown}
            autoFocus
          >
            <option value="">{t('categorizeForm.chooseOption')}</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
            <option value={NEW}>{t('categorizeForm.newSeries')}</option>
          </select>
        </label>

        {showSuggestion && (
          <button
            type="button"
            className="bcf-suggest"
            aria-label={t('bulkCategorize.useLastSeries', { title: suggestedSeries.title })}
            onClick={acceptSuggestion}
          >
            <span>
              {t('bulkCategorize.lastSeries')} <b>{suggestedSeries.title}</b>
            </span>
            <span className="bcf-suggest-key" aria-hidden="true">
              TAB
            </span>
          </button>
        )}

        {creatingNewSeries && (
          <label className="cf-field">
            <span>{t('categorizeForm.newSeriesName')}</span>
            <input
              type="text"
              value={newSeriesTitle}
              onChange={(event) => setNewSeriesTitle(event.target.value)}
              placeholder={t('categorizeForm.newSeriesPlaceholder')}
            />
          </label>
        )}

        <label className="bcf-switch">
          <input type="checkbox" checked={sameVolume} onChange={(event) => handleSameVolumeChange(event.target.checked)} />
          <span>{t('bulkCategorize.sameVolume')}</span>
        </label>

        {sameVolume && (
          <label className="cf-field">
            <span>{t('categorizeForm.volume')}</span>
            <input
              type="number"
              value={sharedVolume}
              onChange={(event) => setSharedVolume(event.target.value)}
              placeholder={t('categorizeForm.newVolumeNumberPlaceholder')}
              min="0"
            />
          </label>
        )}

        {existingVolumes.length > 0 && (
          <p className="bcf-hint">
            {t('bulkCategorize.existingVolumes', { numbers: existingVolumes.map((volume) => volume.number).join(', ') })}
          </p>
        )}

        {prefilledCount > 0 && (
          <p className="bcf-hint">{t('bulkCategorize.numbersFromFiles', { count: prefilledCount })}</p>
        )}

        <ul className="bcf-rows">
          {rows.map((row) => (
            <li key={row.id} className="bcf-row">
              <span className="bcf-name">{row.fileName}</span>
              <div className="bcf-fields">
                {!sameVolume && (
                  <label className="bcf-mini">
                    <span>{t('bulkCategorize.volumeShort')}</span>
                    <input
                      type="number"
                      value={row.volume}
                      onChange={(event) => updateRow(row.id, { volume: event.target.value })}
                      placeholder={t('categorizeForm.newVolumeNumberPlaceholder')}
                      min="0"
                      aria-label={t('bulkCategorize.rowVolumeAria', { fileName: row.fileName })}
                    />
                  </label>
                )}
                <label className="bcf-mini">
                  <span>{t('bulkCategorize.chapterShort')}</span>
                  <input
                    type="number"
                    value={row.number}
                    onChange={(event) => updateRow(row.id, { number: event.target.value })}
                    placeholder={t('categorizeForm.chapterNumberPlaceholder')}
                    min="0"
                    step="any"
                    aria-label={t('bulkCategorize.rowNumberAria', { fileName: row.fileName })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}

        <div className="cf-actions">
          <button type="button" className="cf-cancel" onClick={onCancel} disabled={saving}>
            {t('categorizeForm.cancel')}
          </button>
          <button type="submit" className="cf-save" disabled={saving}>
            {saving ? t('categorizeForm.saving') : t('bulkCategorize.save', { count: rows.length })}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BulkCategorizeForm;
