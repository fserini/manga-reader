import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportBackup, restoreBackup } from '../db.js';
import { useTheme } from '../ThemeContext.jsx';
import './Settings.css';

const THEME_OPTIONS = [
  { value: 'light', key: 'settings.theme.light' },
  { value: 'dark', key: 'settings.theme.dark' },
  { value: 'system', key: 'settings.theme.system' },
];

// Le lingue supportate, come i18n.js: qui non serve dedurre nulla, solo
// offrire una scelta e passarla a i18n.changeLanguage.
const LANGUAGE_OPTIONS = [
  { value: 'it', key: 'settings.language.it' },
  { value: 'en', key: 'settings.language.en' },
];

function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
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
      setMessage(t('settings.exportSuccess'));
    } catch {
      setError(t('settings.exportError'));
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
        setError(t('settings.invalidBackupFile'));
        return;
      }
      setPendingBackup(backup);
    } catch {
      setError(t('settings.unreadableBackupFile'));
    }
  }

  async function confirmRestore() {
    setBusy(true);
    try {
      await restoreBackup(pendingBackup);
      setPendingBackup(null);
      setMessage(t('settings.restoreSuccess'));
    } catch {
      setError(t('settings.restoreError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>

      <section className="settings-section" aria-labelledby="theme-heading">
        <h2 id="theme-heading">{t('settings.appearanceHeading')}</h2>
        <p className="settings-hint">{t('settings.appearanceHint')}</p>

        <div className="settings-theme-options" role="radiogroup" aria-labelledby="theme-heading">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className={theme === option.value ? 'settings-theme-active' : ''}
              onClick={() => setTheme(option.value)}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="language-heading">
        <h2 id="language-heading">{t('settings.languageHeading')}</h2>
        <p className="settings-hint">{t('settings.languageHint')}</p>

        <div className="settings-theme-options" role="radiogroup" aria-labelledby="language-heading">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={i18n.resolvedLanguage === option.value}
              className={i18n.resolvedLanguage === option.value ? 'settings-theme-active' : ''}
              onClick={() => i18n.changeLanguage(option.value)}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="backup-heading">
        <h2 id="backup-heading">{t('settings.backupHeading')}</h2>
        <p className="settings-hint">{t('settings.backupHint')}</p>

        <div className="settings-actions">
          <button type="button" onClick={handleExport} disabled={busy}>
            {t('settings.exportButton')}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {t('settings.importButton')}
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
            <h2 id="restore-title">{t('settings.restoreTitle')}</h2>
            <p>{t('settings.restoreWarning')}</p>
            <p className="settings-hint">{t('settings.restoreHandleHint')}</p>
            <div className="settings-dialog-actions">
              <button type="button" onClick={() => setPendingBackup(null)} disabled={busy}>
                {t('settings.cancel')}
              </button>
              <button type="button" className="settings-danger" onClick={confirmRestore} disabled={busy}>
                {busy ? t('settings.restoring') : t('settings.restoreConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
