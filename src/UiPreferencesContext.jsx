import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadPrefs, savePrefs } from './uiPreferences.js';

// Le preferenze di aspetto servono in due punti lontani tra loro: la barra in
// alto (App) che le usa per disegnarsi, e Impostazioni che le cambia. Un
// Context le rende disponibili a entrambi senza passarle di mano in mano.
const UiPreferencesContext = createContext(null);

export function UiPreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPrefs);

  const setPref = useCallback((key, value) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, setPref }), [prefs, setPref]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

// useUiPreferences sta con il Context che consuma, come useAppChrome.
// eslint-disable-next-line react-refresh/only-export-components
export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error('useUiPreferences deve essere usato dentro un UiPreferencesProvider');
  }
  return context;
}
