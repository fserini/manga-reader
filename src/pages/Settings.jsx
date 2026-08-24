import { useRef, useState } from 'react';
import { exportBackup, restoreBackup } from '../db.js';
import './Settings.css';

function Settings() {
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // Backup appena letto dal file scelto, in attesa di conferma prima di
  // sostituire la libreria attuale — vedi il dialog più in basso.
  const [pendingBackup, setPendingBackup] = useState(null);

  async function handleExport() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const backup = await exportBackup();
      const json = JSON.stringify(backup);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `manga-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Backup esportato.');
    } catch {
      setError('Esportazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  // Legge e valida il file scelto, ma NON scrive ancora nulla nel database:
  // prima serve la conferma esplicita dell'utente (il ripristino sostituisce
  // l'intera libreria attuale, è un'operazione distruttiva).
  async function handleFileSelected(event) {
    const file = event.target.files[0];
    event.target.value = ''; // permette di riselezionare lo stesso file in futuro
    if (!file) return;

    setError(null);
    setMessage(null);
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || !Array.isArray(backup.series)) {
        setError('Il file scelto non è un backup valido.');
        return;
      }
      setPendingBackup(backup);
    } catch {
      setError('Impossibile leggere il file: non è un backup JSON valido.');
    }
  }

  async function confirmRestore() {
    setBusy(true);
    try {
      await restoreBackup(pendingBackup);
      setPendingBackup(null);
      setMessage(
        'Libreria ripristinata. I capitoli non sono ancora leggibili: reimporta gli stessi file dalla Libreria per ricollegarli (verranno riconosciuti automaticamente, non duplicati).',
      );
    } catch {
      setError('Ripristino non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Impostazioni</h1>

      <section className="settings-section" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Backup e ripristino</h2>
        <p className="settings-hint">
          Esporta l&apos;intera libreria (serie, volumi, capitoli, progressi di lettura, preferiti)
          in un file da conservare o trasferire su un altro dispositivo.
        </p>

        <div className="settings-actions">
          <button type="button" onClick={handleExport} disabled={busy}>
            Esporta backup
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Importa backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="settings-file-input"
            onChange={handleFileSelected}
          />
        </div>

        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="settings-message" role="status">
            {message}
          </p>
        )}
      </section>

      {pendingBackup && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <div className="settings-dialog">
            <h2 id="restore-title">Ripristinare questo backup?</h2>
            <p>
              La libreria attuale (serie, volumi, capitoli, progressi, preferiti) verrà sostituita
              interamente con quella del file scelto. L&apos;operazione non si può annullare.
            </p>
            <p className="settings-hint">
              I capitoli ripristinati non saranno subito leggibili: gli handle ai file fisici non
              sono mai esportabili (sono legati a questo browser/dispositivo). Vanno ricollegati
              re-importando gli stessi file dopo il ripristino.
            </p>
            <div className="settings-dialog-actions">
              <button type="button" onClick={() => setPendingBackup(null)} disabled={busy}>
                Annulla
              </button>
              <button type="button" className="settings-danger" onClick={confirmRestore} disabled={busy}>
                {busy ? 'Ripristino…' : 'Ripristina (sostituisci tutto)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
