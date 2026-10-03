import './Brand.css';

// Il nome dell'app trattato come marchio, non come semplice scritta (ADR-002).
// Tre varianti, scelte dall'utente in Impostazioni → Aspetto:
// - sigillo (predefinita): 読 come timbro azzurro, leggermente ruotato
// - dorso: un libro di taglio con 読, nome su due righe
// - blueline: il nome con il filo blu delle tavole sotto
// Il nome è lo stesso in ogni lingua ("Manga Reader" è il nome del prodotto,
// non un testo da tradurre), quindi non passa da i18n.
function Brand({ variant = 'sigillo' }) {
  if (variant === 'dorso') {
    return (
      <span className="brand brand--dorso">
        <span className="brand-spine" aria-hidden="true">
          <b>読</b>
        </span>
        <span className="brand-name">
          <strong>Manga</strong>
          <small>Reader</small>
        </span>
      </span>
    );
  }

  if (variant === 'blueline') {
    return (
      <span className="brand brand--blueline">
        <span className="brand-row">
          <strong>Manga</strong>
          <small>reader</small>
        </span>
        <span className="brand-line" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="brand brand--sigillo">
      <span className="brand-seal" aria-hidden="true">
        読
      </span>
      <span className="brand-name">
        Manga <em>Reader</em>
      </span>
    </span>
  );
}

export default Brand;
