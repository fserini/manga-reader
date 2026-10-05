import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { estimateBackupSize, inspectBackupFile, restoreBackupFile } from '../db.js';
import { PROFILE_SECTIONS } from '../profileSections.js';
import { saveBackup } from '../backupFile.js';
import { formatBytes } from '../formatBytes.js';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import { useUiPreferences } from '../UiPreferencesContext.jsx';
import { LOGO_OPTIONS, MENU_OPTIONS, START_PAGE_OPTIONS, FULLSCREEN_OPTIONS, THREAD_OPTIONS } from '../uiPreferences.js';
import { isFullscreenSupported } from '../fullscreen.js';
import './Settings.css';

// Le lingue supportate, come i18n.js: qui non serve dedurre nulla, solo
// offrire una scelta e passarla a i18n.changeLanguage.
const LANGUAGE_OPTIONS = [
  { value: 'it', key: 'settings.language.it' },
  { value: 'en', key: 'settings.language.en' },
];

// Una delle pagine delle impostazioni, dentro la scheda Profilo (Fase 35):
// Aspetto, Lingua oppure Backup e ripristino, a /profilo/<voce>. Prima erano
// tre sezioni di un'unica pagina lunga; ora il menu della chiave inglese porta
// a quella che serve. L'indirizzo decide quale mostrare; uno sconosciuto torna
// al Profilo.
function SettingsSection() {
  const { section } = useParams();
  if (!PROFILE_SECTIONS.some((candidate) => candidate.id === section)) {
    return <Navigate to="/profilo" replace />;
  }
  return <SettingsSectionPage section={section} />;
}

function SettingsSectionPage({ section }) {
  const { t, i18n } = useTranslation();
  const { prefs, setPref } = useUiPreferences();
  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // Backup appena letto dal file scelto, in attesa di conferma prima di
  // sostituire la libreria attuale — vedi il dialog più in basso.
  const [pendingBackup, setPendingBackup] = useState(null);
  // 'full' | 'light', stima delle dimensioni e avanzamento dell'operazione
  // in corso ({ kind, done, total } o null).
  const [backupMode, setBackupMode] = useState('full');
  const [estimate, setEstimate] = useState(null);
  const [progress, setProgress] = useState(null);

  // Quanto pesa il backup (completo e leggero), per far scegliere. Si calcola
  // una volta all'apertura della pagina del backup: somma le dimensioni delle
  // miniature, senza leggerle.
  useEffect(() => {
    if (section !== 'backup') return undefined;
    let cancelled = false;
    estimateBackupSize()
      .then((result) => {
        if (!cancelled) setEstimate(result);
      })
      .catch(() => {}); // è solo un'indicazione: senza, il backup funziona comunque
    return () => {
      cancelled = true;
    };
  }, [section]);

  async function handleExport() {
    setError(null);
    setMessage(null);
    setBusy(true);
    setProgress(null);
    try {
      const { cancelled } = await saveBackup({
        light: backupMode === 'light',
        onProgress: (value) => setProgress({ kind: 'export', ...value }),
      });
      if (!cancelled) setMessage(t('settings.exportSuccess'));
    } catch {
      setError(t('settings.exportError'));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  // Controlla il file scelto, ma NON scrive ancora nulla nel database: prima
  // serve la conferma esplicita dell'utente (il ripristino sostituisce
  // l'intera libreria attuale, è un'operazione distruttiva).
  async function handleFileSelected(event) {
    const file = event.target.files[0];
    event.target.value = ''; // permette di riselezionare lo stesso file in futuro
    if (!file) return;

    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      setPendingBackup({ file, inspected: await inspectBackupFile(file) });
    } catch (inspectError) {
      setError(
        inspectError.code === 'invalid' ? t('settings.invalidBackupFile') : t('settings.unreadableBackupFile'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    setBusy(true);
    setProgress(null);
    try {
      await restoreBackupFile(pendingBackup.file, pendingBackup.inspected, {
        onProgress: (value) => setProgress({ kind: 'restore', ...value }),
      });
      setPendingBackup(null);
      setMessage(t('settings.restoreSuccess'));
      estimateBackupSize().then(setEstimate).catch(() => {});
    } catch {
      setError(t('settings.restoreError'));
      setPendingBackup(null);
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <Link to="/profilo" className="settings-back">
        <Icon name="back" size={16} />
        {t('profile.title')}
      </Link>

      <div className="page-heading">
        <span className="page-eyebrow" aria-hidden="true">設定</span>
        <h1>{t(`profile.menu.${section}`)}</h1>
      </div>

      {section === 'aspetto' && (
      <section className="settings-section" aria-label={t('profile.menu.aspetto')}>
        <p className="settings-hint">{t('settings.appearanceHint')}</p>

        <h3 id="logo-label" className="settings-subheading">
          {t('settings.logoLabel')}
        </h3>
        <div className="settings-logo-options" role="radiogroup" aria-labelledby="logo-label">
          {LOGO_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={prefs.logo === option}
              className={`settings-logo-card${prefs.logo === option ? ' settings-logo-active' : ''}`}
              onClick={() => setPref('logo', option)}
            >
              <Brand variant={option} />
              <span>{t(`settings.logo.${option}`)}</span>
            </button>
          ))}
        </div>

        <h3 id="menu-label" className="settings-subheading">
          {t('settings.menuLabel')}
        </h3>
        <div className="settings-pill-options" role="radiogroup" aria-labelledby="menu-label">
          {MENU_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={prefs.menu === option}
              className={prefs.menu === option ? 'settings-pill-active' : ''}
              onClick={() => setPref('menu', option)}
            >
              {t(`settings.menu.${option}`)}
            </button>
          ))}
        </div>

        <h3 id="start-label" className="settings-subheading">
          {t('settings.startPageLabel')}
        </h3>
        <div className="settings-pill-options" role="radiogroup" aria-labelledby="start-label">
          {START_PAGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={prefs.startPage === option}
              className={prefs.startPage === option ? 'settings-pill-active' : ''}
              onClick={() => setPref('startPage', option)}
            >
              {t(`settings.startPage.${option}`)}
            </button>
          ))}
        </div>
        <p className="settings-hint settings-hint--small">{t('settings.startPageHint')}</p>

        <h3 id="fullscreen-label" className="settings-subheading">
          {t('settings.fullscreenLabel')}
        </h3>
        <div className="settings-pill-options" role="radiogroup" aria-labelledby="fullscreen-label">
          {FULLSCREEN_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={prefs.fullscreen === option}
              className={prefs.fullscreen === option ? 'settings-pill-active' : ''}
              onClick={() => setPref('fullscreen', option)}
            >
              {t(`settings.fullscreen.${option}`)}
            </button>
          ))}
        </div>
        <p className="settings-hint settings-hint--small">
          {t(isFullscreenSupported() ? 'settings.fullscreenHint' : 'settings.fullscreenUnsupported')}
        </p>

        <h3 id="thread-label" className="settings-subheading">
          {t('settings.threadLabel')}
        </h3>
        <div className="settings-pill-options" role="radiogroup" aria-labelledby="thread-label">
          {THREAD_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={prefs.thread === option}
              className={prefs.thread === option ? 'settings-pill-active' : ''}
              onClick={() => setPref('thread', option)}
            >
              {t(`settings.thread.${option}`)}
            </button>
          ))}
        </div>
        <p className="settings-hint settings-hint--small">{t('settings.threadHint')}</p>
      </section>
      )}

      {section === 'lingua' && (
      <section className="settings-section" aria-label={t('profile.menu.lingua')}>
        <p className="settings-hint">{t('settings.languageHint')}</p>

        <div className="settings-pill-options" role="radiogroup" aria-label={t('profile.menu.lingua')}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={i18n.resolvedLanguage === option.value}
              className={i18n.resolvedLanguage === option.value ? 'settings-pill-active' : ''}
              onClick={() => i18n.changeLanguage(option.value)}
            >
              {t(option.key)}
            </button>
          ))}
        </div>
      </section>
      )}

      {section === 'backup' && (
      <section className="settings-section" aria-label={t('profile.menu.backup')}>
        <p className="settings-hint">{t('settings.backupHint')}</p>

        <h3 id="backup-mode-label" className="settings-subheading">
          {t('settings.backupModeLabel')}
        </h3>
        <div className="settings-pill-options" role="radiogroup" aria-labelledby="backup-mode-label">
          {['full', 'light'].map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={backupMode === mode}
              className={backupMode === mode ? 'settings-pill-active' : ''}
              onClick={() => setBackupMode(mode)}
              disabled={busy}
            >
              {t(`settings.backupMode.${mode}`)}
            </button>
          ))}
        </div>
        <p className="settings-hint settings-hint--small">
          {estimate
            ? t(backupMode === 'light' ? 'settings.backupModeLightHint' : 'settings.backupModeFullHint', {
                size: formatBytes(backupMode === 'light' ? estimate.lightBytes : estimate.fullBytes, i18n.resolvedLanguage),
              })
            : t('settings.backupEstimating')}
          {estimate && ` ${t('settings.backupLibrarySummary', { count: estimate.chapters })}`}
        </p>

        <div className="settings-actions settings-actions--spaced">
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

        {progress && progress.kind === 'export' && (
          <p className="settings-message" role="status">
            {t('settings.exportProgress', { done: progress.done, total: progress.total })}
          </p>
        )}
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
      )}

      {pendingBackup && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <div className="settings-dialog">
            <h2 id="restore-title">{t('settings.restoreTitle')}</h2>
            <p className="settings-hint">
              {t('settings.restoreSummary', pendingBackup.inspected.counts)}
              {pendingBackup.inspected.light && ` ${t('settings.restoreLightNote')}`}
            </p>
            <p>{t('settings.restoreWarning')}</p>
            <p className="settings-hint">{t('settings.restoreHandleHint')}</p>
            <div className="settings-dialog-actions">
              <button type="button" onClick={() => setPendingBackup(null)} disabled={busy}>
                {t('settings.cancel')}
              </button>
              <button type="button" className="settings-danger" onClick={confirmRestore} disabled={busy}>
                {busy
                  ? progress?.kind === 'restore'
                    ? t('settings.restoreProgress', { done: progress.done, total: progress.total })
                    : t('settings.restoring')
                  : t('settings.restoreConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsSection;
