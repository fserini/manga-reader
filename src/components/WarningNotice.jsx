import Icon from './Icon.jsx';
import './WarningNotice.css';

// Avviso giallo (Fase 34): qualcosa che l'utente deve sapere ma che non è un
// errore (per esempio, un titolo che non è presente in libreria). Distinto
// dall'azzurro delle informazioni e dal rosso degli errori veri.
function WarningNotice({ children }) {
  return (
    <p className="warning-notice" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </p>
  );
}

export default WarningNotice;
