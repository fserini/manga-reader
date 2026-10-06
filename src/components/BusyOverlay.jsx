import './BusyOverlay.css';

// Attesa a tutto schermo per un'operazione lunga (Fase 38: l'importazione di una
// cartella intera). Un'icona che gira — "finta": non mostra quanto manca, dice
// solo che l'app sta lavorando — e un breve testo. Copre la pagina, così nel
// frattempo non si tocca altro. Presentazionale: i testi arrivano già tradotti.
function BusyOverlay({ title, note }) {
  return (
    <div className="busy-overlay" role="alert" aria-busy="true">
      <div className="busy-panel">
        <span className="busy-spinner" aria-hidden="true" />
        <strong className="busy-title">{title}</strong>
        {note && <p className="busy-note">{note}</p>}
      </div>
    </div>
  );
}

export default BusyOverlay;
