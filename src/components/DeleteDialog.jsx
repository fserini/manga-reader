import { useTranslation } from 'react-i18next';
import './DeleteDialog.css';

// Dialog di conferma per la rimozione di una serie / volume / capitolo.
// È presentazionale: riceve cosa mostrare e tre callback. La logica (cosa
// cancellare e come) sta nel componente genitore.
//
// - label: descrizione di cosa si sta rimuovendo (es. "la serie «One Piece»")
// - note: avviso opzionale (es. "Verranno rimossi anche volumi e capitoli.")
// - canDeleteFiles: se il browser supporta la cancellazione fisica dei file
// - busy: true durante l'operazione (disabilita i pulsanti)
function DeleteDialog({ label, note, canDeleteFiles, busy, onCancel, onRemoveFromLibrary, onDeleteFiles }) {
  const { t } = useTranslation();

  return (
    <div className="dd-overlay" role="dialog" aria-modal="true" aria-labelledby="dd-title">
      <div className="dd-panel">
        <h2 id="dd-title" className="dd-title">
          {t('deleteDialog.title', { label })}
        </h2>
        {note && <p className="dd-note">{note}</p>}

        <p className="dd-question">{t('deleteDialog.question')}</p>

        <div className="dd-actions">
          <button type="button" className="dd-secondary" onClick={onRemoveFromLibrary} disabled={busy}>
            {t('deleteDialog.keepFile')}
          </button>

          {canDeleteFiles && (
            <button type="button" className="dd-danger" onClick={onDeleteFiles} disabled={busy}>
              {t('deleteDialog.deleteFile')}
            </button>
          )}

          <button type="button" className="dd-cancel" onClick={onCancel} disabled={busy}>
            {t('deleteDialog.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteDialog;
