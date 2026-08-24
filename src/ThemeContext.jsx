import { createContext, useContext, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'manga-reader-theme';
const VALID_THEMES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

function readStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID_THEMES.includes(stored) ? stored : 'system';
}

// Applica la scelta al DOM: 'system' rimuove l'attributo (si torna a seguire
// prefers-color-scheme via CSS), 'light'/'dark' lo impostano esplicitamente
// per forzare quella palette indipendentemente dal sistema — vedi index.css.
function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  // useLayoutEffect (non useEffect) applica l'attributo PRIMA che il browser
  // disegni il frame: evita un flash visibile del tema sbagliato al primo
  // caricamento, quando il tema salvato differisce da quello di sistema.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next) {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

// useTheme deve stare con il Context che consuma: separarlo in un file a sé
// eviterebbe l'avviso, ma solo per un guadagno di Fast Refresh in sviluppo
// (qui al più forza un reload completo invece di un hot-reload mirato).
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve essere usato dentro un ThemeProvider');
  }
  return context;
}
