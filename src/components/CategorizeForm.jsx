import { useEffect, useState } from 'react';
import { getAllSeries, getVolumesForSeries, addSeries, addVolume, categorizeChapter } from '../db.js';
import './CategorizeForm.css';

// Valore speciale usato nei menu a tendina per la voce "crea nuovo".
const NEW = 'new';

// Form per assegnare Serie / Volume / numero di Capitolo a un file "da
// categorizzare". Riceve il capitolo da categorizzare e due callback: onCancel
// (chiudi senza salvare) e onDone (salvato: la Libreria ricaricherà l'elenco).
function CategorizeForm({ chapter, onCancel, onDone }) {
  const [series, setSeries] = useState([]);
  const [volumes, setVolumes] = useState([]);

  // '' = nessuna scelta, un id = serie/volume esistente, NEW = da creare.
  const [seriesChoice, setSeriesChoice] = useState('');
  const [volumeChoice, setVolumeChoice] = useState('');
  const [newSeriesTitle, setNewSeriesTitle] = useState('');
  const [newVolumeNumber, setNewVolumeNumber] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const creatingNewSeries = seriesChoice === NEW;

  // Carica le serie esistenti all'apertura del form.
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

  // Quando si sceglie una serie esistente, carica i suoi volumi.
  useEffect(() => {
    if (seriesChoice === '' || seriesChoice === NEW) return;
    let cancelled = false;
    (async () => {
      const list = await getVolumesForSeries(Number(seriesChoice));
      if (!cancelled) setVolumes(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesChoice]);

  // Cambiare serie azzera la scelta del volume (i volumi dipendono dalla serie).
  // Con una serie nuova non esistono volumi: il volume sarà per forza nuovo.
  function handleSeriesChange(value) {
    setSeriesChoice(value);
    setVolumes([]);
    setVolumeChoice(value === NEW ? NEW : '');
    setNewVolumeNumber('');
    setError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (seriesChoice === '') {
      setError('Scegli una serie (o creane una nuova).');
      return;
    }
    if (volumeChoice === '') {
      setError('Scegli un volume (o creane uno nuovo).');
      return;
    }
    const number = Number(chapterNumber);
    if (chapterNumber === '' || !Number.isFinite(number)) {
      setError('Inserisci un numero di capitolo valido.');
      return;
    }

    setSaving(true);
    try {
      let seriesId;
      if (creatingNewSeries) {
        const title = newSeriesTitle.trim();
        if (!title) {
          setError('Inserisci il nome della nuova serie.');
          setSaving(false);
          return;
        }
        seriesId = await addSeries(title);
      } else {
        seriesId = Number(seriesChoice);
      }

      let volumeId;
      if (volumeChoice === NEW) {
        const volumeNumber = Number(newVolumeNumber);
        if (newVolumeNumber === '' || !Number.isFinite(volumeNumber)) {
          setError('Inserisci un numero di volume valido.');
          setSaving(false);
          return;
        }
        volumeId = await addVolume(seriesId, volumeNumber);
      } else {
        volumeId = Number(volumeChoice);
      }

      await categorizeChapter(chapter.id, { seriesId, volumeId, number });
      onDone();
    } catch {
      setError('Salvataggio non riuscito. Riprova.');
      setSaving(false);
    }
  }

  return (
    <div className="cf-overlay" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <form className="cf-panel" onSubmit={handleSubmit}>
        <h2 id="cf-title" className="cf-title">
          Categorizza
        </h2>
        <p className="cf-filename">{chapter.fileName}</p>

        <label className="cf-field">
          <span>Serie</span>
          <select value={seriesChoice} onChange={(event) => handleSeriesChange(event.target.value)}>
            <option value="">— scegli —</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
            <option value={NEW}>➕ Nuova serie…</option>
          </select>
        </label>

        {creatingNewSeries && (
          <label className="cf-field">
            <span>Nome nuova serie</span>
            <input
              type="text"
              value={newSeriesTitle}
              onChange={(event) => setNewSeriesTitle(event.target.value)}
              placeholder="Es. One Piece"
              autoFocus
            />
          </label>
        )}

        {seriesChoice !== '' && !creatingNewSeries && (
          <label className="cf-field">
            <span>Volume</span>
            <select value={volumeChoice} onChange={(event) => setVolumeChoice(event.target.value)}>
              <option value="">— scegli —</option>
              {volumes.map((volume) => (
                <option key={volume.id} value={volume.id}>
                  Volume {volume.number}
                </option>
              ))}
              <option value={NEW}>➕ Nuovo volume…</option>
            </select>
          </label>
        )}

        {volumeChoice === NEW && (
          <label className="cf-field">
            <span>Numero nuovo volume</span>
            <input
              type="number"
              value={newVolumeNumber}
              onChange={(event) => setNewVolumeNumber(event.target.value)}
              placeholder="Es. 1"
              min="0"
            />
          </label>
        )}

        <label className="cf-field">
          <span>Numero capitolo</span>
          <input
            type="number"
            value={chapterNumber}
            onChange={(event) => setChapterNumber(event.target.value)}
            placeholder="Es. 1"
            min="0"
            step="any"
          />
        </label>

        {error && (
          <p className="cf-error" role="alert">
            {error}
          </p>
        )}

        <div className="cf-actions">
          <button type="button" className="cf-cancel" onClick={onCancel} disabled={saving}>
            Annulla
          </button>
          <button type="submit" className="cf-save" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CategorizeForm;
