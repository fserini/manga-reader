import { createContext, useContext, useState } from 'react';

// Canale condiviso tra App (che disegna la barra di navigazione in alto) e
// qualunque pagina che debba farla sparire temporaneamente — oggi solo il
// Lettore, quando nasconde anche i propri controlli interni al tocco. Stesso
// meccanismo di Context visto in passato per il tema, qui riusato per uno
// scopo diverso: non un dato (il tema), ma un comando ("nascondi la barra").
const AppChromeContext = createContext(null);

export function AppChromeProvider({ children }) {
  const [chromeHidden, setChromeHidden] = useState(false);

  return (
    <AppChromeContext.Provider value={{ chromeHidden, setChromeHidden }}>
      {children}
    </AppChromeContext.Provider>
  );
}

// useAppChrome deve stare con il Context che consuma, come in casi analoghi
// già visti nel progetto (al più forza un reload completo invece di un
// hot-reload mirato).
// eslint-disable-next-line react-refresh/only-export-components
export function useAppChrome() {
  const context = useContext(AppChromeContext);
  if (!context) {
    throw new Error('useAppChrome deve essere usato dentro un AppChromeProvider');
  }
  return context;
}
