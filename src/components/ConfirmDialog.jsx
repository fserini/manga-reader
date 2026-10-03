import './ConfirmDialog.css';

// Conferma minimale per un'azione distruttiva ma "leggera": titolo, nota,
// Annulla / conferma. Presentazionale: i testi arrivano già tradotti dal
// chiamante. Per la rimozione di serie/volumi/capitoli, dove serve anche la
// scelta sul file fisico, c'è invece DeleteDialog.
function ConfirmDialog({ title, note, confirmLabel, cancelLabel, busy = false, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-panel">
        <h2 id="confirm-title">{title}</h2>
        {note && <p className="confirm-note">{note}</p>}
        <div className="confirm-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
