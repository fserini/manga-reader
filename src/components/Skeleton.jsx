import './Skeleton.css';

// Segnaposto animati al posto del testo "Caricamento…" (Fase 26): mostrano
// subito la FORMA di ciò che sta per arrivare (righe di elenco con il loro
// "dorso" a sinistra, come i volumi di uno scaffale), così la pagina non
// salta quando i dati arrivano.
//
// `label` è il testo per gli screen reader: i riquadri sono decorativi
// (aria-hidden), ma il contenitore dice comunque che si sta caricando.
export function SkeletonList({ rows = 5, label }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-line skeleton-line--title" style={{ width: `${48 + ((index * 17) % 34)}%` }} />
        </div>
      ))}
    </div>
  );
}

// Titolo di pagina e qualche riga: per l'intera schermata Libreria all'avvio.
export function SkeletonPage({ rows = 5, label }) {
  return (
    <div role="status" aria-label={label}>
      <div className="skeleton-heading" aria-hidden="true">
        <span className="skeleton-line skeleton-line--eyebrow" />
        <span className="skeleton-line skeleton-line--heading" />
      </div>
      <SkeletonList rows={rows} label={label} />
    </div>
  );
}
