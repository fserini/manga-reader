import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Library from './pages/Library.jsx';
import Uncategorized from './pages/Uncategorized.jsx';
import Reader from './pages/Reader.jsx';
import ReaderHome from './pages/ReaderHome.jsx';
import Profile from './pages/Profile.jsx';
import MyList from './pages/MyList.jsx';
import SettingsSection from './pages/SettingsSection.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import Brand from './components/Brand.jsx';
import AppNav from './components/AppNav.jsx';
import { useAppChrome } from './AppChromeContext.jsx';
import { useUiPreferences } from './UiPreferencesContext.jsx';
import { useStartRedirect } from './useStartRedirect.js';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { chromeHidden } = useAppChrome();
  const { prefs } = useUiPreferences();
  const ready = useStartRedirect(prefs.startPage);

  return (
    <div className="app">
      {!chromeHidden && (
        <header className="app-bar">
          <Link to="/" className="app-brand" aria-label={t('nav.home')}>
            <Brand variant={prefs.logo} />
          </Link>
          <AppNav />
        </header>
      )}

      <main className="app-main">
        {ready && (
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/uncategorized" element={<Uncategorized />} />
            <Route path="/reader" element={<ReaderHome />} />
            <Route path="/reader/:chapterId" element={<Reader />} />
            <Route path="/profilo" element={<Profile />} />
            <Route path="/profilo/serie" element={<MyList />} />
            <Route path="/profilo/:section" element={<SettingsSection />} />
            {/* Il vecchio indirizzo delle Impostazioni (Fase 35): un segnalibro o un
                collegamento salvato porta comunque al Profilo. */}
            <Route path="/settings" element={<Navigate to="/profilo" replace />} />
          </Routes>
        )}
      </main>

      <UpdatePrompt />
    </div>
  );
}

export default App;
