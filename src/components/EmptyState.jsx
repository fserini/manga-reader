import Icon from './Icon.jsx';
import './EmptyState.css';

// Stato vuoto curato (Fase 26): un'icona grande, un titolo, una frase e, se
// serve, un'azione. Al posto di un semplice paragrafo di testo, per le
// schermate che un utente nuovo vede vuote.
// `compact`: versione da riga, per i suggerimenti dentro una pagina già piena.
function EmptyState({ icon, title, children, action, onDismiss, dismissLabel, compact = false }) {
  return (
    <section className={`empty-state${compact ? ' empty-state--compact' : ''}`}>
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 22 : 36} />
      </span>
      <div className="empty-state-body">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-text">{children}</p>
        {action}
      </div>
      {onDismiss && (
        <button type="button" className="empty-state-dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="close" size={14} />
        </button>
      )}
    </section>
  );
}

export default EmptyState;
