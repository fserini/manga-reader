import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './i18n.js';
import App from './App.jsx';
import { AppChromeProvider } from './AppChromeContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppChromeProvider>
      {/* basename: su GitHub Pages l'app vive sotto /manga-reader/, non alla
          radice del dominio — vedi "base" in vite.config.js. import.meta.env.BASE_URL
          è quello stesso valore, esposto da Vite a runtime; in sviluppo è "/",
          quindi qui non cambia nulla rispetto a prima. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </AppChromeProvider>
  </StrictMode>,
);
