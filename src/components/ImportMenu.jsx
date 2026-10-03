import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_FORMATS_LABEL } from '../fileAccess.js';
import Icon from './Icon.jsx';
import './ImportMenu.css';

// Un'unica icona "+" con una tendina File / Cartella, al posto dei due
// pulsanti di testo (Fase 29b, ADR-002). onPickFiles e onPickFolder sono i
// gestori che aprono i selettori del sistema: vanno chiamati direttamente dal
// tocco, perché i selettori si aprono solo in risposta a un gesto dell'utente.
function ImportMenu({ onPickFiles, onPickFolder }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Si chiude toccando fuori o con Escape.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function choose(handler) {
    setOpen(false);
    handler();
  }

  return (
    <div className="import-menu" ref={rootRef}>
      <button
        type="button"
        className="import-menu-button"
        aria-label={t('library.import')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="plus" size={22} />
      </button>

      {open && (
        <div className="import-menu-list" role="menu">
          <button type="button" role="menuitem" className="import-menu-item" onClick={() => choose(onPickFiles)}>
            <Icon name="file" />
            <span className="import-menu-text">
              <b>{t('library.importFileLabel')}</b>
              <small>{SUPPORTED_FORMATS_LABEL}</small>
            </span>
          </button>
          <button type="button" role="menuitem" className="import-menu-item" onClick={() => choose(onPickFolder)}>
            <Icon name="folder" />
            <span className="import-menu-text">
              <b>{t('library.importFolderLabel')}</b>
              <small>{t('library.importFolderHint')}</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ImportMenu;
