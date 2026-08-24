import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

// Banner globale (montato una volta in App, indipendente dalla rotta): avvisa
// quando il service worker ha scaricato una nuova versione dell'app e resta
// in attesa di conferma per attivarla — vedi il registerType 'prompt' in
// vite.config.js. needRefresh è una coppia [valore, setter] fornita da
// useRegisterSW, sullo stesso schema di useState.
function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-prompt" role="alert">
      <p>{t('pwa.updateAvailable')}</p>
      <div className="update-prompt-actions">
        <button type="button" onClick={() => setNeedRefresh(false)}>
          {t('pwa.dismiss')}
        </button>
        <button type="button" className="update-prompt-reload" onClick={() => updateServiceWorker(true)}>
          {t('pwa.reload')}
        </button>
      </div>
    </div>
  );
}

export default UpdatePrompt;
