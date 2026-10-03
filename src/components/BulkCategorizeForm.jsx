import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAllSeries, getVolumesForSeries, categorizeChaptersBatch } from '../db.js';
import { suggestForFileName, mostCommon } from '../chapterNameParser.js';
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
// uno per riga; il numero di capitolo è sempre per riga. Tutto è pre-compilato
// dai nomi dei file quando possibile, e resta modificabile.
//
// Il volume si indica per NUMERO, non scegliendolo da un elenco: se la serie ha
// già quel volume lo si usa, altrimenti si crea (vedi categorizeChaptersBatch).
// Un campo solo vale per i due casi, e i volumi già presenti si elencano come
// promemoria.
function BulkCategorizeForm({ chapters, onCancel, onDone }) {
  const { t } = useTranslation();
  const [series, setSeries] = useState([]);
  const [seriesChoice, setSeriesChoice] = useState('');
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  // I volumi della serie scelta, con la serie a cui appartengono: se nel
  // frattempo la scelta è cambiata, l'elenco non è più quello giusto.
  const [loadedVolumes, setLoadedVolumes] = useState({ seriesChoice: null, list: [] });

  const [sameVolume, setSameVolume] = useState(true);
  const [sharedVolume, setSharedVolume] = useState('');
  // Una riga per capitolo: il suo volume (usato solo se sameVolume è falso) e
  // il suo numero, entrambi come testo dei campi.
  const [rows, setRows] = useState(() =>
    chapters.map((chapter) => ({ id: chapter.id, fileName: chapter.fileName, volume: '', number: '' })),
  );

  const [prefilled, setPrefilled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const creatingNewSeries = seriesChoice === NEW;
  const existingVolumes = loadedVolumes.seriesChoice === seriesChoice ? loadedVolumes.list : [];

  // All'apertura: carica le serie e pre-compila dai nomi dei file. Serie: la
  // più frequente tra quelle esistenti a cui i nomi somigliano, altrimenti il
  // nome più frequente come serie nuova. Volume condiviso: il più frequente.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getAllSeries();
      if (cancelled) return;
      setSeries(list);

      const suggestions = chapters.map((chapter) => suggestForFileName(chapter.fileName, list));
      const matchedId = mostCommon(suggestions.map((s) => s.matchedSeries?.id ?? null));
      const guessedTitle = mostCommon(suggestions.map((s) => s.series));
      if (matchedId != null) {
        setSeriesChoice(String(matchedId));
      } else if (guessedTitle) {
        setSeriesChoice(NEW);
        setNewSeriesTitle(guessedTitle);
      }

      const volume = mostCommon(suggestions.map((s) => s.volume));
      if (volume != null) setSharedVolume(String(volume));
      setRows((current) =>
        current.map((row, index) => ({
          ...row,
          volume: suggestions[index].volume != null ? String(suggestions[index].volume) : '',
          number: suggestions[index].chapter != null ? String(suggestions[index].chapter) : '',
        })),
      );
      setPrefilled(
        matchedId != null ||
          Boolean(guessedTitle) ||
          volume != null ||
          suggestions.some((s) => s.chapter != null),
      );
    })();
    return () => {
      cancelled = true;
    };
    // Solo all'apertura: i capitoli del form non cambiano finché è aperto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await categorizeChaptersBatch({
        seriesId: creatingNewSeries ? null : Number(seriesChoice),
        newSeriesTitle: creatingNewSeries ? newSeriesTitle.trim() : null,
        assignments,
      });
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
        {prefilled && <p className="cf-prefilled bcf-prefilled">{t('categorizeForm.prefilled')}</p>}

        <label className="cf-field">
          <span>{t('categorizeForm.series')}</span>
          <select
            value={seriesChoice}
            onChange={(event) => {
              setSeriesChoice(event.target.value);
              setError(null);
            }}
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
