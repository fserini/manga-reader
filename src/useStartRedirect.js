import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getContinueTarget } from './db.js';

// Pagina iniziale (Fase 29b, ADR-002): se l'app viene AVVIATA sulla radice e
// l'utente ha già iniziato a leggere qualcosa, si atterra sulla scheda
// Lettore ("Continua a leggere"), non nel capitolo: il permesso di lettura sul
// file va richiesto durante un tocco, e "Riprendi" è quel tocco.
//
// Tre regole che evitano le trappole tipiche di un reindirizzamento:
// - scatta solo all'avvio: la decisione si prende una volta, al primo render, e
//   `ready` non torna mai a false. Toccare "Libreria" dopo, dentro l'app,
//   non rimanda al Lettore;
// - scatta solo se l'indirizzo di avvio è la radice: i link diretti
//   (/settings, /reader/12) restano dove sono;
// - `replace` al posto di una navigazione normale, così il tasto indietro non
//   resta intrappolato tra la radice e il Lettore.
//
// startPage: 'auto' (Lettore se c'è qualcosa da continuare), 'library',
// 'reader'. Restituisce `ready`: finché è false conviene non disegnare le
// pagine, per non mostrare la Libreria per un istante e poi cambiare.
export function useStartRedirect(startPage) {
  const location = useLocation();
  const navigate = useNavigate();
  const [launchedAtRoot] = useState(() => location.pathname === '/');
  const [ready, setReady] = useState(() => !launchedAtRoot || startPage === 'library');

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;

    (async () => {
      let goToReader = startPage === 'reader';
      if (startPage === 'auto') {
        try {
          goToReader = (await getContinueTarget()) !== null;
        } catch {
          goToReader = false; // un errore di lettura non deve bloccare l'avvio
        }
      }
      if (cancelled) return;
      if (goToReader) navigate('/reader', { replace: true });
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, startPage, navigate]);

  return ready;
}
